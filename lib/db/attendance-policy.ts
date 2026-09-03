import 'server-only';

import { Prisma, type PrismaClient } from '@/app/generated/prisma/client';

export interface LabAttendancePolicy {
  attendanceClosesAtMinute: number;
  attendanceOpensAtMinute: number;
  labId: string;
  timezone: string;
}

export interface AttendancePolicyClock extends LabAttendancePolicy {
  closesAt: Date;
  isOpen: boolean;
  now: Date;
  opensAt: Date;
}

export interface ReconcileLabAttendanceResult extends AttendancePolicyClock {
  closedVisitCount: number;
}

interface PolicyRow {
  attendanceClosesAtMinute: number;
  attendanceOpensAtMinute: number;
  labId: string;
  timezone: string;
}

interface ClockRow {
  closesAt: Date;
  now: Date;
  opensAt: Date;
}

export async function lockLabAttendancePolicy(
  transaction: Prisma.TransactionClient,
  input: { exclusive?: boolean; labId: string },
): Promise<LabAttendancePolicy | null> {
  const lockClause = input.exclusive
    ? Prisma.sql`FOR UPDATE OF lab`
    : Prisma.sql`FOR SHARE OF lab`;
  const rows = await transaction.$queryRaw<PolicyRow[]>(Prisma.sql`
    SELECT
      lab."id" AS "labId",
      lab."timezone",
      lab."attendanceOpensAtMinute",
      lab."attendanceClosesAtMinute"
    FROM "Lab" AS lab
    WHERE lab."id" = ${input.labId}::uuid
      AND lab."isActive" = TRUE
    ${lockClause}
  `);

  return rows.at(0) ?? null;
}

export async function getAttendancePolicyClock(
  transaction: Prisma.TransactionClient,
  policy: LabAttendancePolicy,
  now?: Date,
): Promise<AttendancePolicyClock> {
  const nowExpression =
    now === undefined
      ? Prisma.sql`clock_timestamp()`
      : Prisma.sql`${now}::timestamptz`;
  const rows = await transaction.$queryRaw<ClockRow[]>(Prisma.sql`
    SELECT
      attendance_clock."now",
      (
        (attendance_clock."now" AT TIME ZONE ${policy.timezone})::date
        + make_interval(mins => ${policy.attendanceOpensAtMinute})
      ) AT TIME ZONE ${policy.timezone} AS "opensAt",
      (
        (attendance_clock."now" AT TIME ZONE ${policy.timezone})::date
        + make_interval(mins => ${policy.attendanceClosesAtMinute})
      ) AT TIME ZONE ${policy.timezone} AS "closesAt"
    FROM (SELECT ${nowExpression} AS "now") AS attendance_clock
  `);
  const clock = rows.at(0);

  if (clock === undefined) {
    throw new Error('Could not resolve the attendance policy clock.');
  }

  return {
    ...policy,
    ...clock,
    isOpen:
      clock.opensAt < clock.closesAt &&
      clock.now >= clock.opensAt &&
      clock.now < clock.closesAt,
  };
}

export async function closeDueAttendanceVisits(
  transaction: Prisma.TransactionClient,
  clock: AttendancePolicyClock,
  userId?: string,
): Promise<number> {
  const userScope =
    userId === undefined
      ? Prisma.empty
      : Prisma.sql`AND visit."userId" = ${userId}::uuid`;
  const closedVisits = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH due_visits AS (
      SELECT
        visit."id",
        GREATEST(
          (
            (visit."checkedInAt" AT TIME ZONE ${clock.timezone})::date
            + make_interval(mins => ${clock.attendanceClosesAtMinute})
          ) AT TIME ZONE ${clock.timezone},
          visit."checkedInAt"
        ) AS "closesAt"
      FROM "AttendanceVisit" AS visit
      WHERE visit."labId" = ${clock.labId}::uuid
        AND visit."checkedOutAt" IS NULL
        ${userScope}
        AND GREATEST(
          (
            (visit."checkedInAt" AT TIME ZONE ${clock.timezone})::date
            + make_interval(mins => ${clock.attendanceClosesAtMinute})
          ) AT TIME ZONE ${clock.timezone},
          visit."checkedInAt"
        ) <= ${clock.now}::timestamptz
      ORDER BY visit."id"
      FOR UPDATE OF visit
    )
    UPDATE "AttendanceVisit" AS visit
    SET
      "checkedOutAt" = due_visits."closesAt",
      "checkOutMethod" = 'SYSTEM',
      "checkOutManagerUserId" = NULL
    FROM due_visits
    WHERE visit."id" = due_visits."id"
      AND visit."labId" = ${clock.labId}::uuid
      AND visit."checkedOutAt" IS NULL
    RETURNING visit."id"
  `);

  return closedVisits.length;
}

export async function closeOpenAttendanceVisitsAt(
  transaction: Prisma.TransactionClient,
  input: { labId: string; occurredAt: Date },
): Promise<number> {
  const result = await transaction.attendanceVisit.updateMany({
    where: {
      checkedInAt: { lte: input.occurredAt },
      checkedOutAt: null,
      labId: input.labId,
    },
    data: {
      checkedOutAt: input.occurredAt,
      checkOutManagerUserId: null,
      checkOutMethod: 'SYSTEM',
    },
  });

  return result.count;
}

export async function reconcileLabAttendance(
  client: PrismaClient,
  input: { labId: string; now?: Date },
): Promise<ReconcileLabAttendanceResult | null> {
  return client.$transaction(async (transaction) => {
    const policy = await lockLabAttendancePolicy(transaction, {
      labId: input.labId,
    });

    if (policy === null) {
      return null;
    }

    const clock = await getAttendancePolicyClock(
      transaction,
      policy,
      input.now,
    );
    const closedVisitCount = await closeDueAttendanceVisits(transaction, clock);

    return { ...clock, closedVisitCount };
  });
}
