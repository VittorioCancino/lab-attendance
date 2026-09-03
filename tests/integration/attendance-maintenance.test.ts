import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '@/lib/db/client';
import {
  getAttendanceCronHealth,
  recordAttendanceCronSuccess,
} from '@/lib/db/attendance-maintenance';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

const prisma = createPrismaClient(databaseUrl);

beforeEach(async () => {
  await prisma.attendanceCronState.deleteMany();
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

describe('attendance maintenance heartbeat', () => {
  it('transitions from missing to fresh and keeps the newest success', async () => {
    const lab = await createLab('first-lab');
    const succeededAt = new Date();

    await expect(
      getAttendanceCronHealth(prisma, lab.id),
    ).resolves.toMatchObject({ status: 'MISSING' });
    await expect(
      recordAttendanceCronSuccess(prisma, { labId: lab.id, succeededAt }),
    ).resolves.toBe(true);
    await expect(
      recordAttendanceCronSuccess(prisma, {
        labId: lab.id,
        succeededAt: new Date(succeededAt.getTime() - 60_000),
      }),
    ).resolves.toBe(true);
    await expect(
      getAttendanceCronHealth(prisma, lab.id),
    ).resolves.toMatchObject({ lastSucceededAt: succeededAt, status: 'FRESH' });
  });

  it('reports a heartbeat older than three minutes as stale', async () => {
    const lab = await createLab('first-lab');

    await prisma.attendanceCronState.create({
      data: {
        labId: lab.id,
        lastSucceededAt: new Date(Date.now() - 181_000),
      },
    });

    await expect(
      getAttendanceCronHealth(prisma, lab.id),
    ).resolves.toMatchObject({ status: 'STALE' });
  });

  it('isolates heartbeat state by lab and ignores disabled labs', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');

    await recordAttendanceCronSuccess(prisma, {
      labId: firstLab.id,
      succeededAt: new Date(),
    });

    await expect(
      getAttendanceCronHealth(prisma, firstLab.id),
    ).resolves.toMatchObject({ status: 'FRESH' });
    await expect(
      getAttendanceCronHealth(prisma, secondLab.id),
    ).resolves.toMatchObject({ status: 'MISSING' });

    await prisma.lab.update({
      where: { id: firstLab.id },
      data: { isActive: false },
    });
    await expect(
      getAttendanceCronHealth(prisma, firstLab.id),
    ).resolves.toBeNull();
  });
});
