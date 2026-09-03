export interface AttendanceAutomaticCloseSuccess {
  closedVisitCount: number;
  ok: true;
  processedThrough: string;
}

export interface AttendanceAutomaticCloseError {
  error: 'INSTANCE_UNAVAILABLE' | 'UNAUTHORIZED';
  ok: false;
}

export type AttendanceAutomaticCloseResponse =
  AttendanceAutomaticCloseError | AttendanceAutomaticCloseSuccess;
