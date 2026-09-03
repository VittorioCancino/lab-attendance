import { z } from 'zod';

export const attendanceQrExchangeSchema = z
  .object({
    token: z.string().min(1).max(2048),
  })
  .strict();

export const confirmAttendanceScanSchema = z
  .object({
    expectedAction: z.enum(['CHECK_IN', 'CHECK_OUT']),
    expectedVisitId: z.preprocess(
      (value) => (value === '' ? null : value),
      z.uuid().nullable(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    const hasExpectedVisit = value.expectedVisitId !== null;

    if (
      (value.expectedAction === 'CHECK_IN' && hasExpectedVisit) ||
      (value.expectedAction === 'CHECK_OUT' && !hasExpectedVisit)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid expected attendance state.',
        path: ['expectedVisitId'],
      });
    }
  });

export interface AttendanceQrExchangeSuccess {
  ok: true;
}

export interface AttendanceQrExchangeError {
  error: string;
  ok: false;
}

export type AttendanceQrExchangeResponse =
  AttendanceQrExchangeSuccess | AttendanceQrExchangeError;

export type AttendanceScanActionName = 'CHECK_IN' | 'CHECK_OUT';

export type ConfirmAttendanceScanState =
  | { status: 'IDLE' }
  | { error: string; status: 'ERROR' }
  | {
      action: AttendanceScanActionName;
      duplicate: boolean;
      occurredAt: string;
      status: 'SUCCESS';
    };
