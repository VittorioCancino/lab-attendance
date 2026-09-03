import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  AttendanceScanAction,
  LabMembershipRole,
} from '@/app/generated/prisma/client';
import { createPrismaClient } from '@/lib/db/client';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

const prisma = createPrismaClient(databaseUrl);

beforeEach(async () => {
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

async function createMember(
  email: string,
  labId: string,
  role: LabMembershipRole,
) {
  const user = await prisma.user.create({
    data: {
      email,
      name: email,
      passwordHash: 'not-used-in-schema-tests',
    },
  });

  await prisma.labMembership.create({
    data: { labId, role, userId: user.id },
  });

  return user;
}

function activationTimes() {
  const createdAt = new Date('2026-08-27T00:00:00.000Z');

  return {
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 10 * 60_000),
  };
}

describe('QR display schema', () => {
  it('binds activation creation and revocation to same-lab memberships', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const firstManager = await createMember(
      'manager-a@test.local',
      firstLab.id,
      LabMembershipRole.MANAGER,
    );
    const secondManager = await createMember(
      'manager-b@test.local',
      secondLab.id,
      LabMembershipRole.MANAGER,
    );
    const times = activationTimes();
    const codeHash = 'a'.repeat(64);
    const firstActivation = await prisma.qrDisplayActivation.create({
      data: {
        codeHash,
        createdAt: times.createdAt,
        createdByUserId: firstManager.id,
        expiresAt: times.expiresAt,
        labId: firstLab.id,
        label: 'Entrada principal',
      },
    });

    await expect(
      prisma.qrDisplayActivation.create({
        data: {
          codeHash,
          createdAt: times.createdAt,
          createdByUserId: secondManager.id,
          expiresAt: times.expiresAt,
          labId: secondLab.id,
          label: 'Entrada principal',
        },
      }),
    ).resolves.toMatchObject({ labId: secondLab.id });
    await expect(
      prisma.qrDisplayActivation.create({
        data: {
          codeHash: 'b'.repeat(64),
          createdAt: times.createdAt,
          createdByUserId: firstManager.id,
          expiresAt: times.expiresAt,
          labId: secondLab.id,
          label: 'Laboratorio incorrecto',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.qrDisplayActivation.create({
        data: {
          codeHash: 'c'.repeat(64),
          createdAt: times.createdAt,
          createdByUserId: firstManager.id,
          expiresAt: times.expiresAt,
          labId: firstLab.id,
          label: '  Etiqueta inválida  ',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.qrDisplayActivation.update({
        where: { id: firstActivation.id },
        data: { revokedAt: new Date('2026-08-27T00:05:00.000Z') },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.qrDisplayActivation.update({
        where: { id: firstActivation.id },
        data: {
          revokedAt: new Date('2026-08-27T00:05:00.000Z'),
          revokedByUserId: secondManager.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.qrDisplayActivation.update({
        where: { id: firstActivation.id },
        data: {
          revokedAt: new Date('2026-08-27T00:05:00.000Z'),
          revokedByUserId: firstManager.id,
        },
      }),
    ).resolves.toMatchObject({ revokedByUserId: firstManager.id });
  });

  it('allows one bounded display session per activation', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const firstManager = await createMember(
      'manager-a@test.local',
      firstLab.id,
      LabMembershipRole.MANAGER,
    );
    const secondManager = await createMember(
      'manager-b@test.local',
      secondLab.id,
      LabMembershipRole.MANAGER,
    );
    const times = activationTimes();
    const [firstActivation, secondActivation, unusedActivation] =
      await Promise.all([
        prisma.qrDisplayActivation.create({
          data: {
            codeHash: 'a'.repeat(64),
            createdAt: times.createdAt,
            createdByUserId: firstManager.id,
            expiresAt: times.expiresAt,
            labId: firstLab.id,
            label: 'Entrada A',
          },
        }),
        prisma.qrDisplayActivation.create({
          data: {
            codeHash: 'a'.repeat(64),
            createdAt: times.createdAt,
            createdByUserId: secondManager.id,
            expiresAt: times.expiresAt,
            labId: secondLab.id,
            label: 'Entrada B',
          },
        }),
        prisma.qrDisplayActivation.create({
          data: {
            codeHash: 'b'.repeat(64),
            createdAt: times.createdAt,
            createdByUserId: firstManager.id,
            expiresAt: times.expiresAt,
            labId: firstLab.id,
            label: 'Entrada C',
          },
        }),
      ]);
    const createdAt = new Date('2026-08-27T00:05:00.000Z');
    const expiresAt = new Date(createdAt.getTime() + 12 * 60 * 60_000);
    const firstSession = await prisma.qrDisplaySession.create({
      data: {
        activationId: firstActivation.id,
        createdAt,
        expiresAt,
        labId: firstLab.id,
        tokenHash: 'c'.repeat(64),
      },
    });

    await expect(
      prisma.qrDisplaySession.create({
        data: {
          activationId: secondActivation.id,
          createdAt,
          expiresAt,
          labId: secondLab.id,
          tokenHash: 'c'.repeat(64),
        },
      }),
    ).resolves.toMatchObject({ labId: secondLab.id });
    await expect(
      prisma.qrDisplaySession.create({
        data: {
          activationId: firstActivation.id,
          createdAt,
          expiresAt,
          labId: firstLab.id,
          tokenHash: 'd'.repeat(64),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.qrDisplaySession.create({
        data: {
          activationId: secondActivation.id,
          createdAt,
          expiresAt,
          labId: firstLab.id,
          tokenHash: 'e'.repeat(64),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.qrDisplaySession.create({
        data: {
          activationId: unusedActivation.id,
          createdAt,
          expiresAt: new Date(expiresAt.getTime() + 1),
          labId: firstLab.id,
          tokenHash: 'f'.repeat(64),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.qrDisplaySession.update({
        where: { id: firstSession.id },
        data: {
          revokedAt: new Date('2026-08-27T01:00:00.000Z'),
          revokedByUserId: secondManager.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.qrDisplaySession.update({
        where: { id: firstSession.id },
        data: {
          revokedAt: new Date('2026-08-27T01:00:00.000Z'),
          revokedByUserId: firstManager.id,
        },
      }),
    ).resolves.toMatchObject({ revokedByUserId: firstManager.id });
  });
});

describe('attendance scan schema', () => {
  it('enforces token idempotency and scan-to-visit ownership', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const firstAttendee = await createMember(
      'attendee-a@test.local',
      firstLab.id,
      LabMembershipRole.ATTENDEE,
    );
    const secondAttendee = await createMember(
      'attendee-b@test.local',
      firstLab.id,
      LabMembershipRole.ATTENDEE,
    );
    const otherLabAttendee = await createMember(
      'attendee-c@test.local',
      secondLab.id,
      LabMembershipRole.ATTENDEE,
    );
    const visit = await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-08-27T01:00:00.000Z'),
        checkedOutAt: new Date('2026-08-27T02:00:00.000Z'),
        checkOutMethod: 'QR',
        labId: firstLab.id,
        userId: firstAttendee.id,
      },
    });

    await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-08-27T01:00:00.000Z'),
        checkedOutAt: new Date('2026-08-27T02:00:00.000Z'),
        checkOutMethod: 'QR',
        labId: secondLab.id,
        userId: otherLabAttendee.id,
      },
    });
    await prisma.attendanceScan.create({
      data: {
        action: AttendanceScanAction.CHECK_IN,
        labId: firstLab.id,
        qrWindow: 100,
        scannedAt: new Date('2026-08-27T01:00:00.000Z'),
        userId: firstAttendee.id,
        visitId: visit.id,
      },
    });

    await expect(
      prisma.attendanceScan.create({
        data: {
          action: AttendanceScanAction.CHECK_OUT,
          labId: firstLab.id,
          qrWindow: 100,
          userId: firstAttendee.id,
          visitId: visit.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.attendanceScan.create({
        data: {
          action: AttendanceScanAction.CHECK_IN,
          labId: firstLab.id,
          qrWindow: 101,
          userId: firstAttendee.id,
          visitId: visit.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.attendanceScan.create({
        data: {
          action: AttendanceScanAction.CHECK_OUT,
          labId: firstLab.id,
          qrWindow: 102,
          userId: secondAttendee.id,
          visitId: visit.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.attendanceScan.create({
        data: {
          action: AttendanceScanAction.CHECK_OUT,
          labId: secondLab.id,
          qrWindow: 102,
          userId: otherLabAttendee.id,
          visitId: visit.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.attendanceScan.create({
        data: {
          action: AttendanceScanAction.CHECK_OUT,
          labId: firstLab.id,
          qrWindow: -1,
          userId: firstAttendee.id,
          visitId: visit.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.attendanceScan.create({
        data: {
          action: AttendanceScanAction.CHECK_OUT,
          labId: firstLab.id,
          qrWindow: 101,
          scannedAt: new Date('2026-08-27T02:00:00.000Z'),
          userId: firstAttendee.id,
          visitId: visit.id,
        },
      }),
    ).resolves.toMatchObject({ action: AttendanceScanAction.CHECK_OUT });
    await expect(
      prisma.attendanceVisit.delete({ where: { id: visit.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.attendanceScan.count()).resolves.toBe(2);
  });
});
