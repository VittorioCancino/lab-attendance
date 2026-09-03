export interface LivenessResponse {
  ok: true;
  status: 'LIVE';
}

export type ReadinessResponse =
  { ok: true; status: 'READY' } | { ok: false; status: 'UNAVAILABLE' };

export type AttendanceCronHealthResponse =
  | { ok: true; status: 'FRESH' }
  | { ok: false; status: 'MISSING' | 'STALE' | 'UNAVAILABLE' };
