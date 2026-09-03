import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { argon2id, hash } from 'argon2';

import { LabMembershipRole } from '@/app/generated/prisma/client';
import { changeGlobalAdministratorPassword } from '@/lib/auth/change-password';
import { verifyLoginCredentials } from '@/lib/auth/credentials';
import { getGlobalAdminDashboardData } from '@/lib/db/admin-dashboard';
import { createPrismaClient } from '@/lib/db/client';
import { getAuthorizedUser } from '@/lib/db/user-access';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

const prisma = createPrismaClient(databaseUrl);
const password = 'integration-password';

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

async function createUser(options?: {
  isActive?: boolean;
  isGlobalAdmin?: boolean;
}) {
  return prisma.user.create({
    data: {
      email: 'account@test.local',
      isActive: options?.isActive ?? true,
      isGlobalAdmin: options?.isGlobalAdmin ?? false,
      name: 'Cuenta de prueba',
      passwordHash: await hash(password, { type: argon2id }),
    },
  });
}

describe('local credential authorization', () => {
  it('authenticates an active global administrator without a lab membership', async () => {
    const lab = await createLab('first-lab');
    const user = await createUser({ isGlobalAdmin: true });

    await expect(
      verifyLoginCredentials(prisma, lab.id, {
        email: user.email,
        password,
      }),
    ).resolves.toEqual({
      access: 'GLOBAL_ADMIN',
      email: user.email,
      id: user.id,
      labId: lab.id,
      name: user.name,
      sessionVersion: 0,
    });
    await expect(
      getAuthorizedUser(prisma, user.id, lab.id),
    ).resolves.toMatchObject({ access: 'GLOBAL_ADMIN', id: user.id });
  });

  it('changes the global administrator password and invalidates old sessions', async () => {
    const lab = await createLab('first-lab');
    const user = await createUser({ isGlobalAdmin: true });

    await expect(
      changeGlobalAdministratorPassword(prisma, {
        currentPassword: password,
        newPassword: 'updated-integration-password',
        userId: user.id,
      }),
    ).resolves.toBe('CHANGED');

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    expect(updatedUser.sessionVersion).toBe(1);
    await expect(
      verifyLoginCredentials(prisma, lab.id, {
        email: user.email,
        password,
      }),
    ).resolves.toBeNull();
    await expect(
      verifyLoginCredentials(prisma, lab.id, {
        email: user.email,
        password: 'updated-integration-password',
      }),
    ).resolves.toMatchObject({ id: user.id, sessionVersion: 1 });
  });

  it('does not change the password when the current credential is invalid', async () => {
    const user = await createUser({ isGlobalAdmin: true });

    await expect(
      changeGlobalAdministratorPassword(prisma, {
        currentPassword: 'incorrect-password',
        newPassword: 'updated-integration-password',
        userId: user.id,
      }),
    ).resolves.toBe('CURRENT_PASSWORD_INVALID');

    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).resolves.toMatchObject({
      passwordHash: user.passwordHash,
      sessionVersion: 0,
    });
  });

  it('authorizes a manager only through an active current-lab membership', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const user = await createUser();

    await prisma.labMembership.create({
      data: {
        labId: firstLab.id,
        role: LabMembershipRole.MANAGER,
        userId: user.id,
      },
    });

    await expect(
      verifyLoginCredentials(prisma, firstLab.id, {
        email: user.email,
        password,
      }),
    ).resolves.toMatchObject({
      access: LabMembershipRole.MANAGER,
      id: user.id,
      labId: firstLab.id,
    });
    await expect(
      verifyLoginCredentials(prisma, secondLab.id, {
        email: user.email,
        password,
      }),
    ).resolves.toBeNull();
    await expect(
      getAuthorizedUser(prisma, user.id, firstLab.id),
    ).resolves.toMatchObject({ access: LabMembershipRole.MANAGER });
    await expect(
      getAuthorizedUser(prisma, user.id, secondLab.id),
    ).resolves.toBeNull();
  });

  it('resolves an attendee identity for the QR-specific login surface', async () => {
    const lab = await createLab('first-lab');
    const user = await createUser();

    await prisma.labMembership.create({
      data: {
        labId: lab.id,
        role: LabMembershipRole.ATTENDEE,
        userId: user.id,
      },
    });

    await expect(
      verifyLoginCredentials(prisma, lab.id, {
        email: user.email,
        password,
      }),
    ).resolves.toMatchObject({
      access: LabMembershipRole.ATTENDEE,
      id: user.id,
      labId: lab.id,
    });
  });

  it('rejects invalid passwords, inactive users, and users without access', async () => {
    const lab = await createLab('first-lab');
    const user = await createUser();

    await expect(
      verifyLoginCredentials(prisma, lab.id, {
        email: user.email,
        password: 'incorrect-password',
      }),
    ).resolves.toBeNull();
    await expect(
      verifyLoginCredentials(prisma, lab.id, {
        email: user.email,
        password,
      }),
    ).resolves.toBeNull();

    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false, isGlobalAdmin: true },
    });

    await expect(
      verifyLoginCredentials(prisma, lab.id, {
        email: user.email,
        password,
      }),
    ).resolves.toBeNull();
  });

  it('keeps administrator dashboard counts scoped to the configured lab', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const manager = await createUser();
    const attendee = await prisma.user.create({
      data: {
        email: 'attendee@test.local',
        name: 'Asistente de prueba',
        passwordHash: await hash(password, { type: argon2id }),
      },
    });

    await prisma.labMembership.createMany({
      data: [
        {
          labId: firstLab.id,
          role: LabMembershipRole.MANAGER,
          userId: manager.id,
        },
        {
          labId: firstLab.id,
          role: LabMembershipRole.ATTENDEE,
          userId: attendee.id,
        },
        {
          labId: secondLab.id,
          role: LabMembershipRole.ATTENDEE,
          userId: manager.id,
        },
      ],
    });

    await expect(
      getGlobalAdminDashboardData(prisma, firstLab.id),
    ).resolves.toEqual({ activeAttendeeCount: 1, activeManagerCount: 1 });
  });
});
