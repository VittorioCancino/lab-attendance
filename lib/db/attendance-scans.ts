import 'server-only';

import { Prisma, type PrismaClient } from '@/app/generated/prisma/client';
import {
  closeDueAttendanceVisits,
  getAttendancePolicyClock,
  lockLabAttendancePolicy,
} from '@/lib/db/attendance-policy';
import type { AttendanceScanActionName } from '@/lib/types/attendance-scan.types';

export interface AttendanceScanPreview {
  attendanceClosesAtMinute: number;
  attendanceOpensAtMinute: number;
  checkInAllowed: boolean;
  checkedInAt: Date | null;
  nextAction: AttendanceScanActionName;
  visitId: string | null;
}

export type RecordAttendanceScanResult =
  | { ok: false; reason: 'CHECK_IN_CLOSED' }
  | { ok: false; reason: 'NOT_AUTHORIZED' }
  | { ok: false; reason: 'STATE_CHANGED' }
  | {
      action: AttendanceScanActionName;
      duplicate: boolean;
      occurredAt: Date;
      ok: true;
      scanId: string;
      visitId: string;
    };

async function lockAuthorizedAttendee(
  transaction: Prisma.TransactionClient,
  input: { labId: string; userId: string },
): Promise<boolean> {
  const memberships = await transaction.$queryRaw<{ userId: string }[]>(
    Prisma.sql`
      SELECT membership."userId"
      FROM "LabMembership" AS membership
      INNER JOIN "User" AS account
        ON account."id" = membership."userId"
      WHERE membership."labId" = ${input.labId}::uuid
        AND membership."userId" = ${input.userId}::uuid
        AND membership."role" = 'ATTENDEE'
        AND membership."isActive" = TRUE
        AND account."isActive" = TRUE
      FOR UPDATE OF membership
      FOR SHARE OF account
    `,
  );

  return memberships.length === 1;
}

export async function getAttendanceScanPreview(
  client: PrismaClient,
  input: { labId: string; now?: Date; userId: string },
): Promise<AttendanceScanPreview | null> {
  return client.$transaction(async (transaction) => {
    const policy = await lockLabAttendancePolicy(transaction, {
      labId: input.labId,
    });

    if (
      policy === null ||
      !(await lockAuthorizedAttendee(transaction, input))
    ) {
      return null;
    }

    const clock = await getAttendancePolicyClock(
      transaction,
      policy,
      input.now,
    );

    await closeDueAttendanceVisits(transaction, clock, input.userId);

    const openVisit = await transaction.attendanceVisit.findFirst({
      where: {
        checkedOutAt: null,
        labId: input.labId,
        userId: input.userId,
      },
      select: { checkedInAt: true, id: true },
    });

    return {
      attendanceClosesAtMinute: clock.attendanceClosesAtMinute,
      attendanceOpensAtMinute: clock.attendanceOpensAtMinute,
      checkInAllowed: clock.isOpen,
      checkedInAt: openVisit?.checkedInAt ?? null,
      nextAction: openVisit === null ? 'CHECK_IN' : 'CHECK_OUT',
      visitId: openVisit?.id ?? null,
    };
  });
}

export async function recordAttendanceScan(
  client: PrismaClient,
  input: {
    expectedAction: AttendanceScanActionName;
    expectedVisitId: string | null;
    labId: string;
    now?: Date;
    qrWindow: number;
    userId: string;
  },
): Promise<RecordAttendanceScanResult> {
  return client.$transaction(async (transaction) => {
    const policy = await lockLabAttendancePolicy(transaction, {
      labId: input.labId,
    });

    if (
      policy === null ||
      !(await lockAuthorizedAttendee(transaction, input))
    ) {
      return { ok: false, reason: 'NOT_AUTHORIZED' };
    }

    const previousScan = await transaction.attendanceScan.findUnique({
      where: {
        labId_userId_qrWindow: {
          labId: input.labId,
          qrWindow: input.qrWindow,
          userId: input.userId,
        },
      },
      select: {
        action: true,
        id: true,
        scannedAt: true,
        visitId: true,
      },
    });

    const clock = await getAttendancePolicyClock(
      transaction,
      policy,
      input.now,
    );

    await closeDueAttendanceVisits(transaction, clock, input.userId);

    if (previousScan !== null) {
      return {
        action: previousScan.action,
        duplicate: true,
        occurredAt: previousScan.scannedAt,
        ok: true,
        scanId: previousScan.id,
        visitId: previousScan.visitId,
      };
    }

    const openVisits = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT visit."id"
      FROM "AttendanceVisit" AS visit
      WHERE visit."labId" = ${input.labId}::uuid
        AND visit."userId" = ${input.userId}::uuid
        AND visit."checkedOutAt" IS NULL
      FOR UPDATE OF visit
    `);
    const openVisit = openVisits.at(0) ?? null;

    if (
      (input.expectedAction === 'CHECK_IN' &&
        (input.expectedVisitId !== null || openVisit !== null)) ||
      (input.expectedAction === 'CHECK_OUT' &&
        (input.expectedVisitId === null ||
          openVisit?.id !== input.expectedVisitId))
    ) {
      return { ok: false, reason: 'STATE_CHANGED' };
    }

    if (openVisit === null) {
      if (!clock.isOpen) {
        return { ok: false, reason: 'CHECK_IN_CLOSED' };
      }

      const visit = await transaction.attendanceVisit.create({
        data: {
          checkInMethod: 'QR',
          checkedInAt: clock.now,
          labId: input.labId,
          userId: input.userId,
        },
        select: { id: true },
      });
      const scan = await transaction.attendanceScan.create({
        data: {
          action: 'CHECK_IN',
          labId: input.labId,
          qrWindow: input.qrWindow,
          scannedAt: clock.now,
          userId: input.userId,
          visitId: visit.id,
        },
        select: { id: true },
      });

      return {
        action: 'CHECK_IN',
        duplicate: false,
        occurredAt: clock.now,
        ok: true,
        scanId: scan.id,
        visitId: visit.id,
      };
    }

    const checkout = await transaction.attendanceVisit.updateMany({
      where: {
        checkedOutAt: null,
        id: openVisit.id,
        labId: input.labId,
        userId: input.userId,
      },
      data: { checkedOutAt: clock.now, checkOutMethod: 'QR' },
    });

    if (checkout.count !== 1) {
      return { ok: false, reason: 'STATE_CHANGED' };
    }

    const scan = await transaction.attendanceScan.create({
      data: {
        action: 'CHECK_OUT',
        labId: input.labId,
        qrWindow: input.qrWindow,
        scannedAt: clock.now,
        userId: input.userId,
        visitId: openVisit.id,
      },
      select: { id: true },
    });

    return {
      action: 'CHECK_OUT',
      duplicate: false,
      occurredAt: clock.now,
      ok: true,
      scanId: scan.id,
      visitId: openVisit.id,
    };
  });
}
