import { NextResponse } from 'next/server';

import { parseAttendanceCronSecret, parseServerEnvironment } from '@/lib/env';
import type { ReadinessResponse } from '@/lib/types/health.types';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function unavailableResponse(): NextResponse<ReadinessResponse> {
  return NextResponse.json(
    { ok: false, status: 'UNAVAILABLE' },
    { headers: NO_STORE_HEADERS, status: 503 },
  );
}

export async function GET(): Promise<NextResponse<ReadinessResponse>> {
  try {
    parseServerEnvironment(process.env);

    if (parseAttendanceCronSecret(process.env) === null) {
      return unavailableResponse();
    }

    const [{ prisma }, { getCurrentLab }] = await Promise.all([
      import('@/lib/db/prisma'),
      import('@/lib/tenant/current-lab'),
    ]);
    const lab = await getCurrentLab();

    await prisma.attendanceCronState.findUnique({
      where: { labId: lab.id },
      select: { labId: true },
    });

    return NextResponse.json(
      { ok: true, status: 'READY' },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return unavailableResponse();
  }
}
