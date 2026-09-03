import { NextResponse } from 'next/server';

import { getAttendanceCronHealth } from '@/lib/db/attendance-maintenance';
import { prisma } from '@/lib/db/prisma';
import { getCurrentLab } from '@/lib/tenant/current-lab';
import type { AttendanceCronHealthResponse } from '@/lib/types/health.types';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function unavailableResponse(
  status: 'MISSING' | 'STALE' | 'UNAVAILABLE',
): NextResponse<AttendanceCronHealthResponse> {
  return NextResponse.json(
    { ok: false, status },
    { headers: NO_STORE_HEADERS, status: 503 },
  );
}

export async function GET(): Promise<
  NextResponse<AttendanceCronHealthResponse>
> {
  try {
    const lab = await getCurrentLab();
    const health = await getAttendanceCronHealth(prisma, lab.id);

    if (health === null) {
      return unavailableResponse('UNAVAILABLE');
    }

    if (health.status !== 'FRESH') {
      return unavailableResponse(health.status);
    }

    return NextResponse.json(
      { ok: true, status: 'FRESH' },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return unavailableResponse('UNAVAILABLE');
  }
}
