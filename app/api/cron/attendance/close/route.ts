import { NextResponse } from 'next/server';

import { isValidAttendanceCronAuthorization } from '@/lib/auth/attendance-cron';
import { recordAttendanceCronSuccess } from '@/lib/db/attendance-maintenance';
import { reconcileLabAttendance } from '@/lib/db/attendance-policy';
import { prisma } from '@/lib/db/prisma';
import { deleteExpiredRateLimitBuckets } from '@/lib/db/rate-limits';
import { parseAttendanceCronSecret } from '@/lib/env';
import { logSecurityAudit } from '@/lib/logging/security-audit';
import { getCurrentLab } from '@/lib/tenant/current-lab';
import type { AttendanceAutomaticCloseResponse } from '@/lib/types/attendance-auto-close.types';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function unavailableResponse(): NextResponse<AttendanceAutomaticCloseResponse> {
  return NextResponse.json(
    { error: 'INSTANCE_UNAVAILABLE', ok: false },
    { headers: NO_STORE_HEADERS, status: 503 },
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse<AttendanceAutomaticCloseResponse>> {
  const cronSecret = parseAttendanceCronSecret(process.env);

  if (cronSecret === null) {
    return unavailableResponse();
  }

  if (
    !isValidAttendanceCronAuthorization(
      request.headers.get('authorization'),
      cronSecret,
    )
  ) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', ok: false },
      {
        headers: {
          ...NO_STORE_HEADERS,
          'WWW-Authenticate': 'Bearer',
        },
        status: 401,
      },
    );
  }

  let labId: string | undefined;

  try {
    const lab = await getCurrentLab();
    labId = lab.id;
    const result = await reconcileLabAttendance(prisma, { labId: lab.id });

    if (result === null) {
      logSecurityAudit({
        event: 'ATTENDANCE_CRON',
        labId,
        operation: 'CLOSE',
        outcome: 'FAILED',
        reason: 'DEPENDENCY_UNAVAILABLE',
      });

      return unavailableResponse();
    }

    const heartbeatRecorded = await recordAttendanceCronSuccess(prisma, {
      labId: lab.id,
      succeededAt: result.now,
    });

    if (!heartbeatRecorded) {
      logSecurityAudit({
        event: 'ATTENDANCE_CRON',
        labId,
        operation: 'CLOSE',
        outcome: 'FAILED',
        reason: 'HEARTBEAT_FAILED',
      });

      return unavailableResponse();
    }

    try {
      await deleteExpiredRateLimitBuckets(prisma, lab.id);
    } catch {
      logSecurityAudit({
        event: 'ATTENDANCE_CRON',
        labId,
        operation: 'CLEANUP',
        outcome: 'FAILED',
        reason: 'CLEANUP_FAILED',
      });
    }

    logSecurityAudit({
      event: 'ATTENDANCE_CRON',
      labId,
      operation: 'CLOSE',
      outcome: 'SUCCEEDED',
      reason: 'COMPLETED',
    });

    return NextResponse.json(
      {
        closedVisitCount: result.closedVisitCount,
        ok: true,
        processedThrough: result.now.toISOString(),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    logSecurityAudit({
      event: 'ATTENDANCE_CRON',
      ...(labId === undefined ? {} : { labId }),
      operation: 'CLOSE',
      outcome: 'FAILED',
      reason: 'DEPENDENCY_UNAVAILABLE',
    });

    return unavailableResponse();
  }
}
