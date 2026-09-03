import { NextResponse } from 'next/server';

import type { LivenessResponse } from '@/lib/types/health.types';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse<LivenessResponse> {
  return NextResponse.json(
    { ok: true, status: 'LIVE' },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
