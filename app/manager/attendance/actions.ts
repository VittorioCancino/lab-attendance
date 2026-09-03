'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireLabManager } from '@/lib/auth/require-lab-manager';
import {
  recordManagerAttendance,
  updateAttendanceSchedule,
} from '@/lib/db/attendance-management';
import { prisma } from '@/lib/db/prisma';
import { logSecurityAudit } from '@/lib/logging/security-audit';
import {
  attendanceScheduleFormSchema,
  attendanceTimeToMinute,
  managerCheckInFormSchema,
  managerCheckOutFormSchema,
  type AttendanceScheduleActionState,
  type ManagerAttendanceNotice,
} from '@/lib/types/attendance.types';

const MANAGER_ATTENDANCE_PATH = '/manager/attendance';

function redirectWithNotice(notice: ManagerAttendanceNotice): never {
  revalidatePath(MANAGER_ATTENDANCE_PATH);
  redirect(`${MANAGER_ATTENDANCE_PATH}?notice=${notice}#attendance-notice`);
}

export async function updateAttendanceScheduleAction(
  _previousState: AttendanceScheduleActionState,
  formData: FormData,
): Promise<AttendanceScheduleActionState> {
  const context = await requireLabManager();
  const submittedClosesAt = formData.get('closesAt');
  const submittedExpectedClosesAt = formData.get('expectedClosesAt');
  const submittedExpectedOpensAt = formData.get('expectedOpensAt');
  const submittedOpensAt = formData.get('opensAt');
  const values = {
    closesAt: typeof submittedClosesAt === 'string' ? submittedClosesAt : '',
    expectedClosesAt:
      typeof submittedExpectedClosesAt === 'string'
        ? submittedExpectedClosesAt
        : '',
    expectedOpensAt:
      typeof submittedExpectedOpensAt === 'string'
        ? submittedExpectedOpensAt
        : '',
    opensAt: typeof submittedOpensAt === 'string' ? submittedOpensAt : '',
  };
  const parsed = attendanceScheduleFormSchema.safeParse(values);

  if (!parsed.success) {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'ATTENDANCE_MANAGEMENT',
      labId: context.lab.id,
      operation: 'UPDATE_SCHEDULE',
      outcome: 'REJECTED',
      reason: 'INVALID_INPUT',
    });

    return {
      error:
        'Revise las horas ingresadas. El cierre debe ser posterior a la apertura dentro del mismo día.',
      values,
    };
  }

  const result = await updateAttendanceSchedule(prisma, {
    attendanceClosesAtMinute: attendanceTimeToMinute(parsed.data.closesAt),
    attendanceOpensAtMinute: attendanceTimeToMinute(parsed.data.opensAt),
    expectedClosesAtMinute: attendanceTimeToMinute(
      parsed.data.expectedClosesAt,
    ),
    expectedOpensAtMinute: attendanceTimeToMinute(parsed.data.expectedOpensAt),
    labId: context.lab.id,
    managerUserId: context.user.id,
  });

  if (!result.ok) {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'ATTENDANCE_MANAGEMENT',
      labId: context.lab.id,
      operation: 'UPDATE_SCHEDULE',
      outcome: 'REJECTED',
      reason: result.reason,
    });

    if (result.reason === 'STATE_CHANGED') {
      redirectWithNotice('schedule-changed');
    }

    return {
      error: 'No fue posible actualizar el horario de asistencia.',
      values,
    };
  }

  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'ATTENDANCE_MANAGEMENT',
    labId: context.lab.id,
    operation: 'UPDATE_SCHEDULE',
    outcome: 'SUCCEEDED',
    reason: 'SCHEDULE_UPDATED',
  });

  redirectWithNotice('schedule-updated');
}

export async function checkInAttendeeAction(formData: FormData): Promise<void> {
  const context = await requireLabManager();
  const parsed = managerCheckInFormSchema.safeParse({
    userId: formData.get('userId'),
  });

  if (!parsed.success) {
    logSecurityAudit({
      action: 'CHECK_IN',
      actorUserId: context.user.id,
      event: 'ATTENDANCE_MANAGEMENT',
      labId: context.lab.id,
      operation: 'RECORD',
      outcome: 'REJECTED',
      reason: 'INVALID_INPUT',
    });

    redirectWithNotice('unavailable');
  }

  const result = await recordManagerAttendance(prisma, {
    action: 'CHECK_IN',
    attendeeUserId: parsed.data.userId,
    labId: context.lab.id,
    managerUserId: context.user.id,
  });

  if (result.ok) {
    logSecurityAudit({
      action: result.action,
      actorUserId: context.user.id,
      event: 'ATTENDANCE_MANAGEMENT',
      labId: context.lab.id,
      operation: 'RECORD',
      outcome: 'SUCCEEDED',
      reason: 'RECORDED',
      targetUserId: parsed.data.userId,
      visitId: result.visitId,
    });

    redirectWithNotice('check-in-recorded');
  }

  logSecurityAudit({
    action: 'CHECK_IN',
    actorUserId: context.user.id,
    event: 'ATTENDANCE_MANAGEMENT',
    labId: context.lab.id,
    operation: 'RECORD',
    outcome: 'REJECTED',
    reason:
      result.reason === 'CHECK_IN_CLOSED'
        ? 'CHECK_IN_CLOSED'
        : result.reason === 'STATE_CHANGED'
          ? 'STATE_CHANGED'
          : 'NOT_AUTHORIZED',
    targetUserId: parsed.data.userId,
  });

  redirectWithNotice(
    result.reason === 'CHECK_IN_CLOSED'
      ? 'check-in-closed'
      : result.reason === 'STATE_CHANGED'
        ? 'state-changed'
        : 'unavailable',
  );
}

export async function checkOutAttendeeAction(
  formData: FormData,
): Promise<void> {
  const context = await requireLabManager();
  const parsed = managerCheckOutFormSchema.safeParse({
    userId: formData.get('userId'),
    visitId: formData.get('visitId'),
  });

  if (!parsed.success) {
    logSecurityAudit({
      action: 'CHECK_OUT',
      actorUserId: context.user.id,
      event: 'ATTENDANCE_MANAGEMENT',
      labId: context.lab.id,
      operation: 'RECORD',
      outcome: 'REJECTED',
      reason: 'INVALID_INPUT',
    });

    redirectWithNotice('unavailable');
  }

  const result = await recordManagerAttendance(prisma, {
    action: 'CHECK_OUT',
    attendeeUserId: parsed.data.userId,
    expectedVisitId: parsed.data.visitId,
    labId: context.lab.id,
    managerUserId: context.user.id,
  });

  if (result.ok) {
    logSecurityAudit({
      action: result.action,
      actorUserId: context.user.id,
      event: 'ATTENDANCE_MANAGEMENT',
      labId: context.lab.id,
      operation: 'RECORD',
      outcome: 'SUCCEEDED',
      reason: 'RECORDED',
      targetUserId: parsed.data.userId,
      visitId: result.visitId,
    });

    redirectWithNotice('check-out-recorded');
  }

  logSecurityAudit({
    action: 'CHECK_OUT',
    actorUserId: context.user.id,
    event: 'ATTENDANCE_MANAGEMENT',
    labId: context.lab.id,
    operation: 'RECORD',
    outcome: 'REJECTED',
    reason:
      result.reason === 'STATE_CHANGED' ? 'STATE_CHANGED' : 'NOT_AUTHORIZED',
    targetUserId: parsed.data.userId,
    visitId: parsed.data.visitId,
  });

  redirectWithNotice(
    result.reason === 'STATE_CHANGED' ? 'state-changed' : 'unavailable',
  );
}
