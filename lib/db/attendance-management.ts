import 'server-only';

import { Prisma, type PrismaClient } from '@/app/generated/prisma/client';
import {
  closeDueAttendanceVisits,
  closeOpenAttendanceVisitsAt,
  getAttendancePolicyClock,
  lockLabAttendancePolicy,
} from '@/lib/db/attendance-policy';

type ManagerAttendanceInput =
  | {
      action: 'CHECK_IN';
      attendeeUserId: string;
      labId: string;
      managerUserId: string;
      now?: Date;
    }
  | {
      action: 'CHECK_OUT';
      attendeeUserId: string;
      expectedVisitId: string;
      labId: string;
      managerUserId: string;
      now?: Date;
    };

export type RecordManagerAttendanceResult =
  | { ok: false; reason: 'CHECK_IN_CLOSED' }
  | { ok: false; reason: 'NOT_AUTHORIZED' }
  | { ok: false; reason: 'STATE_CHANGED' }
  | { ok: false; reason: 'TARGET_UNAVAILABLE' }
  | {
      action: 'CHECK_IN' | 'CHECK_OUT';
      occurredAt: Date;
      ok: true;
      visitId: string;
    };

export type UpdateAttendanceScheduleResult =
  | { ok: false; reason: 'NOT_AUTHORIZED' }
  | { ok: false; reason: 'STATE_CHANGED' }
  | {
      attendanceClosesAtMinute: number;
      attendanceOpensAtMinute: number;
      closedVisitCount: number;
      ok: true;
    };

interface AttendeeAuthorizationRow {
  isAccountActive: boolean;
  isMembershipActive: boolean;
  userId: string;
}

async function lockAuthorizedManager(
  transaction: Prisma.TransactionClient,
  input: { labId: string; managerUserId: string },
): Promise<boolean> {
  const managers = await transaction.$queryRaw<{ userId: string }[]>(Prisma.sql`
    SELECT membership."userId"
    FROM "LabMembership" AS membership
    INNER JOIN "User" AS account
      ON account."id" = membership."userId"
    WHERE membership."labId" = ${input.labId}::uuid
      AND membership."userId" = ${input.managerUserId}::uuid
      AND membership."role" = 'MANAGER'
      AND membership."isActive" = TRUE
      AND account."isActive" = TRUE
    FOR SHARE OF membership, account
  `);

  return managers.length === 1;
}

async function lockTargetAttendee(
  transaction: Prisma.TransactionClient,
  input: { attendeeUserId: string; labId: string },
): Promise<AttendeeAuthorizationRow | null> {
  const attendees = await transaction.$queryRaw<AttendeeAuthorizationRow[]>(
    Prisma.sql`
      SELECT
        membership."userId",
        membership."isActive" AS "isMembershipActive",
        account."isActive" AS "isAccountActive"
      FROM "LabMembership" AS membership
      INNER JOIN "User" AS account
        ON account."id" = membership."userId"
      WHERE membership."labId" = ${input.labId}::uuid
        AND membership."userId" = ${input.attendeeUserId}::uuid
        AND membership."role" = 'ATTENDEE'
      FOR UPDATE OF membership
      FOR SHARE OF account
    `,
  );

  return attendees.at(0) ?? null;
}

export async function recordManagerAttendance(
  client: PrismaClient,
  input: ManagerAttendanceInput,
): Promise<RecordManagerAttendanceResult> {
  return client.$transaction(async (transaction) => {
    const policy = await lockLabAttendancePolicy(transaction, {
      labId: input.labId,
    });

    if (policy === null || !(await lockAuthorizedManager(transaction, input))) {
      return { ok: false, reason: 'NOT_AUTHORIZED' };
    }

    const attendee = await lockTargetAttendee(transaction, input);

    if (attendee === null) {
      return { ok: false, reason: 'TARGET_UNAVAILABLE' };
    }

    const clock = await getAttendancePolicyClock(
      transaction,
      policy,
      input.now,
    );

    await closeDueAttendanceVisits(transaction, clock, input.attendeeUserId);

    const openVisit = await transaction.attendanceVisit.findFirst({
      where: {
        checkedOutAt: null,
        labId: input.labId,
        userId: input.attendeeUserId,
      },
      select: { id: true },
    });

    if (input.action === 'CHECK_IN') {
      if (openVisit !== null) {
        return { ok: false, reason: 'STATE_CHANGED' };
      }

      if (!attendee.isAccountActive || !attendee.isMembershipActive) {
        return { ok: false, reason: 'TARGET_UNAVAILABLE' };
      }

      if (!clock.isOpen) {
        return { ok: false, reason: 'CHECK_IN_CLOSED' };
      }

      const visit = await transaction.attendanceVisit.create({
        data: {
          checkInManagerUserId: input.managerUserId,
          checkInMethod: 'MANAGER',
          checkedInAt: clock.now,
          labId: input.labId,
          userId: input.attendeeUserId,
        },
        select: { id: true },
      });

      return {
        action: 'CHECK_IN',
        occurredAt: clock.now,
        ok: true,
        visitId: visit.id,
      };
    }

    if (openVisit?.id !== input.expectedVisitId) {
      return { ok: false, reason: 'STATE_CHANGED' };
    }

    const checkout = await transaction.attendanceVisit.updateMany({
      where: {
        checkedOutAt: null,
        id: input.expectedVisitId,
        labId: input.labId,
        userId: input.attendeeUserId,
      },
      data: {
        checkedOutAt: clock.now,
        checkOutManagerUserId: input.managerUserId,
        checkOutMethod: 'MANAGER',
      },
    });

    if (checkout.count !== 1) {
      return { ok: false, reason: 'STATE_CHANGED' };
    }

    return {
      action: 'CHECK_OUT',
      occurredAt: clock.now,
      ok: true,
      visitId: input.expectedVisitId,
    };
  });
}

export async function updateAttendanceSchedule(
  client: PrismaClient,
  input: {
    attendanceClosesAtMinute: number;
    attendanceOpensAtMinute: number;
    expectedClosesAtMinute: number;
    expectedOpensAtMinute: number;
    labId: string;
    managerUserId: string;
    now?: Date;
  },
): Promise<UpdateAttendanceScheduleResult> {
  return client.$transaction(async (transaction) => {
    const currentPolicy = await lockLabAttendancePolicy(transaction, {
      exclusive: true,
      labId: input.labId,
    });

    if (
      currentPolicy === null ||
      !(await lockAuthorizedManager(transaction, input))
    ) {
      return { ok: false, reason: 'NOT_AUTHORIZED' };
    }

    if (
      currentPolicy.attendanceClosesAtMinute !== input.expectedClosesAtMinute ||
      currentPolicy.attendanceOpensAtMinute !== input.expectedOpensAtMinute
    ) {
      return { ok: false, reason: 'STATE_CHANGED' };
    }

    const currentClock = await getAttendancePolicyClock(
      transaction,
      currentPolicy,
      input.now,
    );
    let closedVisitCount = await closeDueAttendanceVisits(
      transaction,
      currentClock,
    );
    const update = await transaction.lab.updateMany({
      where: { id: input.labId, isActive: true },
      data: {
        attendanceClosesAtMinute: input.attendanceClosesAtMinute,
        attendanceOpensAtMinute: input.attendanceOpensAtMinute,
      },
    });

    if (update.count !== 1) {
      return { ok: false, reason: 'NOT_AUTHORIZED' };
    }

    const updatedPolicy = {
      attendanceClosesAtMinute: input.attendanceClosesAtMinute,
      attendanceOpensAtMinute: input.attendanceOpensAtMinute,
      labId: input.labId,
      timezone: currentPolicy.timezone,
    };
    const updatedClock = await getAttendancePolicyClock(
      transaction,
      updatedPolicy,
      currentClock.now,
    );

    if (updatedClock.now >= updatedClock.closesAt) {
      closedVisitCount += await closeOpenAttendanceVisitsAt(transaction, {
        labId: input.labId,
        occurredAt: updatedClock.now,
      });
    }

    return {
      attendanceClosesAtMinute: input.attendanceClosesAtMinute,
      attendanceOpensAtMinute: input.attendanceOpensAtMinute,
      closedVisitCount,
      ok: true,
    };
  });
}
