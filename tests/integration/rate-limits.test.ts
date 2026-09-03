import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RateLimitAction } from '@/app/generated/prisma/client';
import { createPrismaClient } from '@/lib/db/client';
import {
  consumeRateLimit,
  deleteExpiredRateLimitBuckets,
  hashRateLimitSubject,
} from '@/lib/db/rate-limits';

vi.mock('@/lib/logging/security-audit', () => ({
  logSecurityAudit: vi.fn(),
}));

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

const prisma = createPrismaClient(databaseUrl);
const secret = 'rate-limit-integration-secret'.repeat(2);

beforeEach(async () => {
  await prisma.rateLimitBucket.deleteMany();
  await prisma.attendanceScan.deleteMany();
  await prisma.attendanceVisit.deleteMany();
  await prisma.qrDisplaySession.deleteMany();
  await prisma.qrDisplayActivation.deleteMany();
  await prisma.labInvitation.deleteMany();
  await prisma.labMembership.deleteMany();
  await prisma.lab.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createLab(slug: string) {
  return prisma.lab.create({
    data: {
      name: `Laboratorio ${slug}`,
      slug,
      timezone: 'America/Santiago',
    },
  });
}

async function seedActiveBucket(input: {
  action: RateLimitAction;
  count: number;
  labId: string;
  scope: string;
  value: string;
}) {
  const now = Date.now();

  return prisma.rateLimitBucket.create({
    data: {
      action: input.action,
      labId: input.labId,
      requestCount: input.count,
      subjectHash: hashRateLimitSubject(secret, {
        action: input.action,
        labId: input.labId,
        scope: input.scope,
        value: input.value,
      }),
      windowEndsAt: new Date(now + 15 * 60_000),
      windowStartedAt: new Date(now - 60_000),
    },
  });
}

describe('PostgreSQL rate limits', () => {
  it('stores only domain-separated subject hashes', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const email = 'person@test.local';

    await expect(
      consumeRateLimit(prisma, {
        action: 'AUTH_CREDENTIALS',
        labId: firstLab.id,
        secret,
        subject: email,
      }),
    ).resolves.toEqual({ status: 'ALLOWED' });

    const buckets = await prisma.rateLimitBucket.findMany({
      where: { labId: firstLab.id },
    });
    const subjectHash = hashRateLimitSubject(secret, {
      action: 'AUTH_CREDENTIALS',
      labId: firstLab.id,
      scope: 'email',
      value: email,
    });
    const tenantHash = hashRateLimitSubject(secret, {
      action: 'AUTH_CREDENTIALS',
      labId: firstLab.id,
      scope: 'tenant',
      value: 'tenant',
    });

    expect(buckets).toHaveLength(2);
    expect(buckets.map((bucket) => bucket.subjectHash).sort()).toEqual(
      [subjectHash, tenantHash].sort(),
    );
    expect(buckets.every((bucket) => bucket.subjectHash !== email)).toBe(true);
    expect(
      hashRateLimitSubject(secret, {
        action: 'AUTH_CREDENTIALS',
        labId: secondLab.id,
        scope: 'email',
        value: email,
      }),
    ).not.toBe(subjectHash);
    expect(
      hashRateLimitSubject(secret, {
        action: 'INVITATION_ACCEPTANCE',
        labId: firstLab.id,
        scope: 'email',
        value: email,
      }),
    ).not.toBe(subjectHash);
  });

  it('enforces subject and tenant ceilings without incrementing past them', async () => {
    const lab = await createLab('first-lab');
    const email = 'person@test.local';

    await seedActiveBucket({
      action: 'AUTH_CREDENTIALS',
      count: 9,
      labId: lab.id,
      scope: 'email',
      value: email,
    });

    await expect(
      consumeRateLimit(prisma, {
        action: 'AUTH_CREDENTIALS',
        labId: lab.id,
        secret,
        subject: email,
      }),
    ).resolves.toEqual({ status: 'ALLOWED' });

    const subjectLimit = await consumeRateLimit(prisma, {
      action: 'AUTH_CREDENTIALS',
      labId: lab.id,
      secret,
      subject: email,
    });

    expect(subjectLimit).toMatchObject({ status: 'LIMITED' });
    await expect(
      prisma.rateLimitBucket.findUniqueOrThrow({
        where: {
          labId_action_subjectHash: {
            action: 'AUTH_CREDENTIALS',
            labId: lab.id,
            subjectHash: hashRateLimitSubject(secret, {
              action: 'AUTH_CREDENTIALS',
              labId: lab.id,
              scope: 'email',
              value: email,
            }),
          },
        },
      }),
    ).resolves.toMatchObject({ requestCount: 10 });

    await prisma.rateLimitBucket.deleteMany();
    await seedActiveBucket({
      action: 'QR_EXCHANGE',
      count: 299,
      labId: lab.id,
      scope: 'tenant',
      value: 'tenant',
    });

    await expect(
      consumeRateLimit(prisma, {
        action: 'QR_EXCHANGE',
        labId: lab.id,
        secret,
      }),
    ).resolves.toEqual({ status: 'ALLOWED' });
    await expect(
      consumeRateLimit(prisma, {
        action: 'QR_EXCHANGE',
        labId: lab.id,
        secret,
      }),
    ).resolves.toMatchObject({ status: 'LIMITED' });
    await expect(
      prisma.rateLimitBucket.findFirstOrThrow(),
    ).resolves.toMatchObject({ requestCount: 300 });
  });

  it('atomically caps concurrent requests', async () => {
    const lab = await createLab('first-lab');
    const userId = 'fcd56566-7aac-4779-83e0-0ca02fd7f088';
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeRateLimit(prisma, {
          action: 'ATTENDANCE_CONFIRMATION',
          labId: lab.id,
          secret,
          subject: userId,
        }),
      ),
    );

    expect(
      results.filter((result) => result.status === 'ALLOWED'),
    ).toHaveLength(10);
    expect(
      results.filter((result) => result.status === 'LIMITED'),
    ).toHaveLength(10);
    await expect(
      prisma.rateLimitBucket.findFirstOrThrow(),
    ).resolves.toMatchObject({ requestCount: 10 });
  });

  it('isolates the same subject between labs', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const userId = 'fcd56566-7aac-4779-83e0-0ca02fd7f088';

    await seedActiveBucket({
      action: 'ATTENDANCE_CONFIRMATION',
      count: 10,
      labId: firstLab.id,
      scope: 'user',
      value: userId,
    });

    await expect(
      consumeRateLimit(prisma, {
        action: 'ATTENDANCE_CONFIRMATION',
        labId: firstLab.id,
        secret,
        subject: userId,
      }),
    ).resolves.toMatchObject({ status: 'LIMITED' });
    await expect(
      consumeRateLimit(prisma, {
        action: 'ATTENDANCE_CONFIRMATION',
        labId: secondLab.id,
        secret,
        subject: userId,
      }),
    ).resolves.toEqual({ status: 'ALLOWED' });
    await expect(
      prisma.rateLimitBucket.count({ where: { labId: secondLab.id } }),
    ).resolves.toBe(1);
  });

  it('deletes only old buckets from the requested lab', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const now = Date.now();

    await prisma.rateLimitBucket.createMany({
      data: [
        {
          action: 'QR_EXCHANGE',
          labId: firstLab.id,
          subjectHash: '1'.repeat(64),
          windowEndsAt: new Date(now - 2 * 60 * 60_000),
          windowStartedAt: new Date(now - 3 * 60 * 60_000),
        },
        {
          action: 'QR_EXCHANGE',
          labId: firstLab.id,
          subjectHash: '2'.repeat(64),
          windowEndsAt: new Date(now - 30 * 60_000),
          windowStartedAt: new Date(now - 90 * 60_000),
        },
        {
          action: 'QR_EXCHANGE',
          labId: secondLab.id,
          subjectHash: '3'.repeat(64),
          windowEndsAt: new Date(now - 2 * 60 * 60_000),
          windowStartedAt: new Date(now - 3 * 60 * 60_000),
        },
      ],
    });

    await expect(
      deleteExpiredRateLimitBuckets(prisma, firstLab.id),
    ).resolves.toBe(1);
    await expect(
      prisma.rateLimitBucket.findMany({
        orderBy: { subjectHash: 'asc' },
        select: { labId: true, subjectHash: true },
      }),
    ).resolves.toEqual([
      { labId: firstLab.id, subjectHash: '2'.repeat(64) },
      { labId: secondLab.id, subjectHash: '3'.repeat(64) },
    ]);
  });
});
