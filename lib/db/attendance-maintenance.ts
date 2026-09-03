import 'server-only';

import { Prisma, type PrismaClient } from '@/app/generated/prisma/client';

export const ATTENDANCE_CRON_STALE_AFTER_SECONDS = 180;

interface AttendanceCronHealthRow {
  checkedAt: Date;
  fresh: boolean | null;
  lastSucceededAt: Date | null;
}

export type AttendanceCronHealth =
  | { checkedAt: Date; status: 'MISSING' }
  | { checkedAt: Date; lastSucceededAt: Date; status: 'FRESH' | 'STALE' };

export async function recordAttendanceCronSuccess(
  client: PrismaClient,
  input: { labId: string; succeededAt: Date },
): Promise<boolean> {
  const changedRows = await client.$executeRaw(Prisma.sql`
    INSERT INTO "AttendanceCronState" AS cron_state (
      "labId",
      "lastSucceededAt"
    )
    VALUES (
      ${input.labId}::uuid,
      ${input.succeededAt}
    )
    ON CONFLICT ("labId")
    DO UPDATE SET
      "lastSucceededAt" = GREATEST(
        cron_state."lastSucceededAt",
        EXCLUDED."lastSucceededAt"
      )
  `);

  return changedRows === 1;
}

export async function getAttendanceCronHealth(
  client: PrismaClient,
  labId: string,
): Promise<AttendanceCronHealth | null> {
  const rows = await client.$queryRaw<AttendanceCronHealthRow[]>(Prisma.sql`
    WITH cron_clock AS MATERIALIZED (
      SELECT clock_timestamp() AS "checkedAt"
    )
    SELECT
      cron_clock."checkedAt",
      cron_state."lastSucceededAt",
      cron_state."lastSucceededAt" >=
        cron_clock."checkedAt" - make_interval(
          secs => ${ATTENDANCE_CRON_STALE_AFTER_SECONDS}::double precision
        ) AS fresh
    FROM "Lab" AS lab
    CROSS JOIN cron_clock
    LEFT JOIN "AttendanceCronState" AS cron_state
      ON cron_state."labId" = lab."id"
    WHERE lab."id" = ${labId}::uuid
      AND lab."isActive" = TRUE
  `);
  const row = rows.at(0);

  if (row === undefined) {
    return null;
  }

  if (row.lastSucceededAt === null || row.fresh === null) {
    return { checkedAt: row.checkedAt, status: 'MISSING' };
  }

  return {
    checkedAt: row.checkedAt,
    lastSucceededAt: row.lastSucceededAt,
    status: row.fresh ? 'FRESH' : 'STALE',
  };
}
