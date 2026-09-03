import 'server-only';

import { createHmac } from 'node:crypto';

import {
  Prisma,
  type PrismaClient,
  type RateLimitAction,
} from '@/app/generated/prisma/client';
import { logSecurityAudit } from '@/lib/logging/security-audit';

interface RateLimitRule {
  limit: number;
  scope: string;
  windowSeconds: number;
}

interface RateLimitRow {
  allowed: boolean;
  checkedAt: Date;
  resetAt: Date;
  retryAfterSeconds: number;
}

type RateLimitRequest =
  | {
      action:
        | 'ATTENDANCE_CONFIRMATION'
        | 'AUTH_CREDENTIALS'
        | 'INVITATION_ACCEPTANCE';
      labId: string;
      secret: string;
      subject: string;
    }
  | {
      action: 'DISPLAY_ACTIVATION' | 'QR_EXCHANGE';
      labId: string;
      secret: string;
    };

export type RateLimitResult =
  | { status: 'ALLOWED' }
  | { retryAfterSeconds: number; status: 'LIMITED' }
  | { status: 'UNAVAILABLE' };

export const RATE_LIMIT_RULES = {
  ATTENDANCE_CONFIRMATION: {
    subject: { limit: 10, scope: 'user', windowSeconds: 5 * 60 },
  },
  AUTH_CREDENTIALS: {
    subject: { limit: 10, scope: 'email', windowSeconds: 15 * 60 },
    tenant: { limit: 120, scope: 'tenant', windowSeconds: 60 },
  },
  DISPLAY_ACTIVATION: {
    tenant: { limit: 10, scope: 'tenant', windowSeconds: 10 * 60 },
  },
  INVITATION_ACCEPTANCE: {
    subject: { limit: 5, scope: 'token', windowSeconds: 15 * 60 },
    tenant: { limit: 60, scope: 'tenant', windowSeconds: 10 * 60 },
  },
  QR_EXCHANGE: {
    tenant: { limit: 300, scope: 'tenant', windowSeconds: 60 },
  },
} as const satisfies Record<
  RateLimitAction,
  { subject?: RateLimitRule; tenant?: RateLimitRule }
>;

export function hashRateLimitSubject(
  secret: string,
  input: {
    action: RateLimitAction;
    labId: string;
    scope: string;
    value: string;
  },
): string {
  return createHmac('sha256', secret)
    .update(
      `lab-attendance:rate-limit:v1\0${input.labId}\0${input.action}\0${input.scope}\0${input.value}`,
    )
    .digest('hex');
}

async function consumeRateLimitBucket(
  transaction: Prisma.TransactionClient,
  input: {
    action: RateLimitAction;
    labId: string;
    limit: number;
    subjectHash: string;
    windowSeconds: number;
  },
): Promise<RateLimitRow> {
  const rows = await transaction.$queryRaw<RateLimitRow[]>(Prisma.sql`
    WITH rate_clock AS MATERIALIZED (
      SELECT
        clock_timestamp() AS "checkedAt",
        make_interval(secs => ${input.windowSeconds}::double precision) AS duration
    ),
    rate_window AS MATERIALIZED (
      SELECT
        clock."checkedAt",
        date_bin(
          clock.duration,
          clock."checkedAt",
          TIMESTAMPTZ '1970-01-01 00:00:00+00'
        ) AS "windowStartedAt",
        date_bin(
          clock.duration,
          clock."checkedAt",
          TIMESTAMPTZ '1970-01-01 00:00:00+00'
        ) + clock.duration AS "windowEndsAt"
      FROM rate_clock AS clock
    ),
    consumed AS (
      INSERT INTO "RateLimitBucket" AS bucket (
        "labId",
        "action",
        "subjectHash",
        "windowStartedAt",
        "windowEndsAt",
        "requestCount"
      )
      SELECT
        ${input.labId}::uuid,
        ${input.action}::"RateLimitAction",
        ${input.subjectHash}::char(64),
        rate_window."windowStartedAt",
        rate_window."windowEndsAt",
        1
      FROM rate_window
      ON CONFLICT ("labId", "action", "subjectHash")
      DO UPDATE SET
        "requestCount" = CASE
          WHEN bucket."windowEndsAt" <= (SELECT "checkedAt" FROM rate_window)
            THEN 1
          ELSE bucket."requestCount" + 1
        END,
        "windowStartedAt" = CASE
          WHEN bucket."windowEndsAt" <= (SELECT "checkedAt" FROM rate_window)
            THEN EXCLUDED."windowStartedAt"
          ELSE bucket."windowStartedAt"
        END,
        "windowEndsAt" = CASE
          WHEN bucket."windowEndsAt" <= (SELECT "checkedAt" FROM rate_window)
            THEN EXCLUDED."windowEndsAt"
          ELSE bucket."windowEndsAt"
        END
      WHERE bucket."windowEndsAt" <= (SELECT "checkedAt" FROM rate_window)
        OR bucket."requestCount" < ${input.limit}
      RETURNING bucket."requestCount"
    )
    SELECT
      EXISTS (SELECT 1 FROM consumed) AS "allowed",
      rate_window."checkedAt",
      rate_window."windowEndsAt" AS "resetAt",
      GREATEST(
        1,
        CEIL(
          EXTRACT(
            EPOCH FROM (
              rate_window."windowEndsAt" - rate_window."checkedAt"
            )
          )
        )
      )::integer AS "retryAfterSeconds"
    FROM rate_window
  `);
  const row = rows.at(0);

  if (row === undefined) {
    throw new Error('Could not consume the rate-limit bucket.');
  }

  return row;
}

export async function consumeRateLimit(
  client: PrismaClient,
  input: RateLimitRequest,
): Promise<RateLimitResult> {
  try {
    return await client.$transaction(async (transaction) => {
      const rules = RATE_LIMIT_RULES[input.action];
      const buckets: { rule: RateLimitRule; value: string }[] = [];

      if ('tenant' in rules) {
        buckets.push({ rule: rules.tenant, value: 'tenant' });
      }

      if ('subject' in rules) {
        if (!('subject' in input)) {
          throw new Error('A rate-limit subject is required for this action.');
        }

        buckets.push({ rule: rules.subject, value: input.subject });
      }

      for (const bucket of buckets) {
        const decision = await consumeRateLimitBucket(transaction, {
          action: input.action,
          labId: input.labId,
          limit: bucket.rule.limit,
          subjectHash: hashRateLimitSubject(input.secret, {
            action: input.action,
            labId: input.labId,
            scope: bucket.rule.scope,
            value: bucket.value,
          }),
          windowSeconds: bucket.rule.windowSeconds,
        });

        if (!decision.allowed) {
          logSecurityAudit({
            action: input.action,
            event: 'RATE_LIMIT',
            labId: input.labId,
            outcome: 'REJECTED',
            reason: 'LIMIT_REACHED',
          });

          return {
            retryAfterSeconds: decision.retryAfterSeconds,
            status: 'LIMITED' as const,
          };
        }
      }

      return { status: 'ALLOWED' as const };
    });
  } catch {
    logSecurityAudit({
      action: input.action,
      event: 'RATE_LIMIT',
      labId: input.labId,
      outcome: 'FAILED',
      reason: 'DEPENDENCY_UNAVAILABLE',
    });

    return { status: 'UNAVAILABLE' };
  }
}

export async function deleteExpiredRateLimitBuckets(
  client: PrismaClient,
  labId: string,
): Promise<number> {
  const deleted = await client.$queryRaw<{ subjectHash: string }[]>(Prisma.sql`
    WITH expired AS (
      SELECT
        bucket."labId",
        bucket."action",
        bucket."subjectHash"
      FROM "RateLimitBucket" AS bucket
      WHERE bucket."labId" = ${labId}::uuid
        AND bucket."windowEndsAt" < clock_timestamp() - INTERVAL '1 hour'
      ORDER BY bucket."windowEndsAt", bucket."action", bucket."subjectHash"
      LIMIT 1000
      FOR UPDATE OF bucket SKIP LOCKED
    )
    DELETE FROM "RateLimitBucket" AS bucket
    USING expired
    WHERE bucket."labId" = expired."labId"
      AND bucket."action" = expired."action"
      AND bucket."subjectHash" = expired."subjectHash"
    RETURNING bucket."subjectHash"
  `);

  return deleted.length;
}
