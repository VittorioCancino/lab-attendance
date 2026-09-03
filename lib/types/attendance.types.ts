import { z } from 'zod';

const attendanceTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export interface AttendanceScheduleFormValues {
  closesAt: string;
  expectedClosesAt: string;
  expectedOpensAt: string;
  opensAt: string;
}

export interface AttendanceScheduleActionState {
  error?: string;
  values: AttendanceScheduleFormValues;
}

export const attendanceScheduleFormSchema = z
  .object({
    closesAt: attendanceTimeSchema,
    expectedClosesAt: attendanceTimeSchema,
    expectedOpensAt: attendanceTimeSchema,
    opensAt: attendanceTimeSchema,
  })
  .strict()
  .refine((value) => value.opensAt < value.closesAt, {
    message: 'Closing time must be after opening time.',
    path: ['closesAt'],
  });

export const managerCheckInFormSchema = z.object({ userId: z.uuid() }).strict();

export const managerCheckOutFormSchema = z
  .object({ userId: z.uuid(), visitId: z.uuid() })
  .strict();

export const managerAttendanceNoticeSchema = z.enum([
  'check-in-recorded',
  'check-in-closed',
  'check-out-recorded',
  'schedule-changed',
  'schedule-updated',
  'state-changed',
  'unavailable',
]);

export type ManagerAttendanceNotice = z.infer<
  typeof managerAttendanceNoticeSchema
>;

export function attendanceTimeToMinute(value: string): number {
  const [hours, minutes] = value.split(':').map(Number) as [number, number];

  return hours * 60 + minutes;
}

export function attendanceMinuteToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
