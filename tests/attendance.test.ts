import { describe, expect, it } from 'vitest';

import { isValidAttendanceCronAuthorization } from '@/lib/auth/attendance-cron';
import { parseAttendanceCronSecret } from '@/lib/env';
import { confirmAttendanceScanSchema } from '@/lib/types/attendance-scan.types';
import {
  attendanceMinuteToTime,
  attendanceScheduleFormSchema,
  attendanceTimeToMinute,
  managerCheckOutFormSchema,
} from '@/lib/types/attendance.types';

describe('attendance schedule contracts', () => {
  it('parses same-day time ranges and converts minute values', () => {
    expect(
      attendanceScheduleFormSchema.parse({
        closesAt: '18:00',
        expectedClosesAt: '18:00',
        expectedOpensAt: '07:00',
        opensAt: '07:00',
      }),
    ).toEqual({
      closesAt: '18:00',
      expectedClosesAt: '18:00',
      expectedOpensAt: '07:00',
      opensAt: '07:00',
    });
    expect(attendanceTimeToMinute('07:05')).toBe(425);
    expect(attendanceMinuteToTime(425)).toBe('07:05');
    expect(attendanceMinuteToTime(1439)).toBe('23:59');
  });

  it.each([
    { closesAt: '07:00', opensAt: '07:00' },
    { closesAt: '06:59', opensAt: '07:00' },
    { closesAt: '24:00', opensAt: '07:00' },
    { closesAt: '18:00:00', opensAt: '07:00' },
    { closesAt: '18:00', opensAt: '7:00' },
  ])('rejects invalid attendance interval $opensAt-$closesAt', (value) => {
    expect(
      attendanceScheduleFormSchema.safeParse({
        ...value,
        expectedClosesAt: '18:00',
        expectedOpensAt: '07:00',
      }).success,
    ).toBe(false);
  });
});

describe('attendance intent contracts', () => {
  const visitId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';

  it('requires scan intent to match visit presence', () => {
    expect(
      confirmAttendanceScanSchema.safeParse({
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
      }).success,
    ).toBe(true);
    expect(
      confirmAttendanceScanSchema.safeParse({
        expectedAction: 'CHECK_OUT',
        expectedVisitId: visitId,
      }).success,
    ).toBe(true);
    expect(
      confirmAttendanceScanSchema.safeParse({
        expectedAction: 'CHECK_IN',
        expectedVisitId: visitId,
      }).success,
    ).toBe(false);
    expect(
      confirmAttendanceScanSchema.safeParse({
        expectedAction: 'CHECK_OUT',
        expectedVisitId: '',
      }).success,
    ).toBe(false);
  });

  it('requires a visit identifier for manager checkout', () => {
    expect(
      managerCheckOutFormSchema.safeParse({ userId, visitId }).success,
    ).toBe(true);
    expect(
      managerCheckOutFormSchema.safeParse({ userId, visitId: '' }).success,
    ).toBe(false);
  });
});

describe('attendance cron authorization', () => {
  const secret = 'attendance-cron-secret-with-32-characters';

  it('accepts only the exact configured bearer credential', () => {
    expect(isValidAttendanceCronAuthorization(`Bearer ${secret}`, secret)).toBe(
      true,
    );
    expect(isValidAttendanceCronAuthorization(null, secret)).toBe(false);
    expect(isValidAttendanceCronAuthorization(`bearer ${secret}`, secret)).toBe(
      false,
    );
    expect(
      isValidAttendanceCronAuthorization('Bearer different-secret', secret),
    ).toBe(false);
    expect(
      isValidAttendanceCronAuthorization(`Bearer ${'x'.repeat(513)}`, secret),
    ).toBe(false);
  });

  it('fails closed for missing or weak cron configuration', () => {
    expect(parseAttendanceCronSecret({})).toBeNull();
    expect(
      parseAttendanceCronSecret({ ATTENDANCE_CRON_SECRET: 'too-short' }),
    ).toBeNull();
    expect(parseAttendanceCronSecret({ ATTENDANCE_CRON_SECRET: secret })).toBe(
      secret,
    );
  });
});
