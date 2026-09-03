import { NextResponse } from 'next/server';

import {
  createPendingAttendanceScanToken,
  verifyRotatingQrToken,
} from '@/lib/auth/qr-tokens';
import { PENDING_ATTENDANCE_SCAN_COOKIE_NAME } from '@/lib/const/qr';
import { prisma } from '@/lib/db/prisma';
import { consumeRateLimit } from '@/lib/db/rate-limits';
import { parseServerEnvironment } from '@/lib/env';
import {
  attendanceQrExchangeSchema,
  type AttendanceQrExchangeResponse,
} from '@/lib/types/attendance-scan.types';
import { getCurrentLab } from '@/lib/tenant/current-lab';

const INVALID_QR_MESSAGE = 'El código QR no es válido o ha expirado.';
const MAX_REQUEST_BODY_BYTES = 4096;

async function readRequestJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');

  if (
    contentLength !== null &&
    (!Number.isSafeInteger(Number(contentLength)) ||
      Number(contentLength) < 0 ||
      Number(contentLength) > MAX_REQUEST_BODY_BYTES)
  ) {
    return null;
  }

  if (request.body === null) {
    return null;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  let chunk = await reader.read();

  while (!chunk.done) {
    byteLength += chunk.value.byteLength;

    if (byteLength > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();
      return null;
    }

    chunks.push(chunk.value);
    chunk = await reader.read();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

function invalidQrResponse(
  status = 400,
  retryAfterSeconds?: number,
): NextResponse<AttendanceQrExchangeResponse> {
  return NextResponse.json(
    { error: INVALID_QR_MESSAGE, ok: false },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        ...(retryAfterSeconds === undefined
          ? {}
          : { 'Retry-After': String(retryAfterSeconds) }),
      },
      status,
    },
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse<AttendanceQrExchangeResponse>> {
  let lab: Awaited<ReturnType<typeof getCurrentLab>>;
  let environment: ReturnType<typeof parseServerEnvironment>;

  try {
    lab = await getCurrentLab();
    environment = parseServerEnvironment(process.env);
  } catch {
    return invalidQrResponse(503);
  }

  const rateLimit = await consumeRateLimit(prisma, {
    action: 'QR_EXCHANGE',
    labId: lab.id,
    secret: environment.AUTH_SECRET,
  });

  if (rateLimit.status !== 'ALLOWED') {
    return invalidQrResponse(
      rateLimit.status === 'LIMITED' ? 429 : 503,
      rateLimit.status === 'LIMITED' ? rateLimit.retryAfterSeconds : undefined,
    );
  }

  let body: unknown;

  try {
    body = await readRequestJson(request);
  } catch {
    return invalidQrResponse();
  }

  const parsed = attendanceQrExchangeSchema.safeParse(body);

  if (!parsed.success) {
    return invalidQrResponse();
  }

  const now = new Date();
  const qrClaims = verifyRotatingQrToken(
    environment.QR_SIGNING_SECRET,
    lab.id,
    parsed.data.token,
    now,
  );

  if (qrClaims === null) {
    return invalidQrResponse();
  }

  const pendingScan = createPendingAttendanceScanToken(
    environment.QR_SIGNING_SECRET,
    lab.id,
    qrClaims.window,
    now,
  );
  const response = NextResponse.json<AttendanceQrExchangeResponse>(
    { ok: true },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );

  response.cookies.set(PENDING_ATTENDANCE_SCAN_COOKIE_NAME, pendingScan.token, {
    expires: pendingScan.expiresAt,
    httpOnly: true,
    path: '/scan',
    sameSite: 'strict',
    secure: new URL(environment.LAB_INSTANCE_PUBLIC_URL).protocol === 'https:',
  });

  return response;
}
