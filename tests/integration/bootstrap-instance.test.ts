import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { argon2id, hash, verify } from 'argon2';

import { changeGlobalAdministratorPassword } from '@/lib/auth/change-password';
import { verifyLoginCredentials } from '@/lib/auth/credentials';
import { registerInstance } from '@/lib/db/bootstrap-instance';
import { createPrismaClient } from '@/lib/db/client';
import { parseInstanceEnvironment } from '@/lib/env';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

const prisma = createPrismaClient(databaseUrl);

const baseEnvironment = {
  AUTH_SECRET: 'test-auth-secret-with-at-least-32-characters',
  AUTH_TRUST_HOST: 'true',
  DATABASE_URL: databaseUrl,
  LAB_INSTANCE_PUBLIC_URL: 'http://localhost:3000',
  LAB_INSTANCE_SLUG: 'bootstrap-lab',
  QR_SIGNING_SECRET: 'test-qr-signing-secret-with-at-least-32-characters',
  INSTANCE_BOOTSTRAP_ENABLED: 'true',
  LAB_INSTANCE_NAME: 'Laboratorio de pruebas',
  LAB_INSTANCE_TIMEZONE: 'America/Santiago',
  LAB_BOOTSTRAP_ADMIN_NAME: 'Administrador de pruebas',
  LAB_BOOTSTRAP_ADMIN_EMAIL: 'admin@test.local',
  LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD: 'integration-password',
};

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

describe('registerInstance', () => {
  it('creates one lab and global administrator without a lab membership', async () => {
    const environment = parseInstanceEnvironment(baseEnvironment);

    await registerInstance(prisma, environment);
    await registerInstance(
      prisma,
      parseInstanceEnvironment({
        ...baseEnvironment,
        LAB_INSTANCE_NAME: 'Nombre reemplazado',
        LAB_INSTANCE_TIMEZONE: 'Etc/UTC',
        LAB_BOOTSTRAP_ADMIN_NAME: 'Nombre reemplazado',
        LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD: 'different-password',
      }),
    );

    const labs = await prisma.lab.findMany();
    const users = await prisma.user.findMany();
    const memberships = await prisma.labMembership.findMany();

    expect(labs).toHaveLength(1);
    expect(labs[0]).toMatchObject({
      name: 'Laboratorio de pruebas',
      slug: 'bootstrap-lab',
      timezone: 'America/Santiago',
    });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: 'admin@test.local',
      isActive: true,
      isGlobalAdmin: true,
      name: 'Administrador de pruebas',
    });
    expect(users[0]?.passwordHash).not.toBe('integration-password');
    await expect(
      verify(users[0]?.passwordHash ?? '', 'integration-password'),
    ).resolves.toBe(true);
    expect(memberships).toHaveLength(0);
  });

  it('binds and promotes an existing user without changing credentials', async () => {
    const passwordHash = await hash('existing-password', { type: argon2id });
    const existingUser = await prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Cuenta existente',
        passwordHash,
      },
    });

    await registerInstance(
      prisma,
      parseInstanceEnvironment({
        ...baseEnvironment,
        LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD: undefined,
      }),
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: existingUser.id },
    });
    expect(user).toMatchObject({
      isActive: true,
      isGlobalAdmin: true,
      name: 'Cuenta existente',
      passwordHash,
    });
    await expect(prisma.labMembership.count()).resolves.toBe(0);
  });

  it('requires an initial password only when creating an administrator', async () => {
    await expect(
      registerInstance(
        prisma,
        parseInstanceEnvironment({
          ...baseEnvironment,
          LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD: undefined,
        }),
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_PASSWORD_REQUIRED' });
    await expect(prisma.lab.count()).resolves.toBe(0);
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('rejects email values that bypass application normalization', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: 'ADMIN@test.local',
          name: 'Correo no normalizado',
          passwordHash: 'not-a-real-password-hash',
        },
      }),
    ).rejects.toBeDefined();
  });

  it('handles concurrent first-start registration without duplicates', async () => {
    const environment = parseInstanceEnvironment(baseEnvironment);

    await Promise.all(
      Array.from({ length: 4 }, async () =>
        registerInstance(prisma, environment),
      ),
    );

    await expect(prisma.lab.count()).resolves.toBe(1);
    await expect(prisma.user.count()).resolves.toBe(1);
    await expect(prisma.labMembership.count()).resolves.toBe(0);
  });

  it('registers separate lab instances while reusing one global administrator', async () => {
    await registerInstance(prisma, parseInstanceEnvironment(baseEnvironment));
    await registerInstance(
      prisma,
      parseInstanceEnvironment({
        ...baseEnvironment,
        LAB_INSTANCE_SLUG: 'second-bootstrap-lab',
        LAB_INSTANCE_NAME: 'Segundo laboratorio de pruebas',
        LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD: undefined,
      }),
    );

    await expect(prisma.lab.count()).resolves.toBe(2);
    await expect(prisma.user.count()).resolves.toBe(1);
    await expect(prisma.labMembership.count()).resolves.toBe(0);
    await expect(
      prisma.lab.findMany({
        orderBy: { slug: 'asc' },
        select: { slug: true },
      }),
    ).resolves.toEqual([
      { slug: 'bootstrap-lab' },
      { slug: 'second-bootstrap-lab' },
    ]);
  });

  it('preserves a dashboard password change when another instance bootstraps', async () => {
    await registerInstance(prisma, parseInstanceEnvironment(baseEnvironment));
    const firstLab = await prisma.lab.findUniqueOrThrow({
      where: { slug: 'bootstrap-lab' },
    });
    const administrator = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@test.local' },
    });

    await expect(
      changeGlobalAdministratorPassword(prisma, {
        currentPassword: 'integration-password',
        newPassword: 'dashboard-password',
        userId: administrator.id,
      }),
    ).resolves.toBe('CHANGED');

    await registerInstance(
      prisma,
      parseInstanceEnvironment({
        ...baseEnvironment,
        LAB_INSTANCE_SLUG: 'second-bootstrap-lab',
        LAB_INSTANCE_NAME: 'Segundo laboratorio de pruebas',
        LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD: 'other-instance-password',
      }),
    );

    await expect(
      verifyLoginCredentials(prisma, firstLab.id, {
        email: 'admin@test.local',
        password: 'integration-password',
      }),
    ).resolves.toBeNull();
    await expect(
      verifyLoginCredentials(prisma, firstLab.id, {
        email: 'admin@test.local',
        password: 'dashboard-password',
      }),
    ).resolves.toMatchObject({
      id: administrator.id,
      sessionVersion: 1,
    });
  });

  it('validates an existing active lab without bootstrap mutations', async () => {
    const lab = await prisma.lab.create({
      data: {
        slug: 'bootstrap-lab',
        name: 'Laboratorio existente',
        timezone: 'Etc/UTC',
      },
    });

    await expect(
      registerInstance(
        prisma,
        parseInstanceEnvironment({
          AUTH_SECRET: baseEnvironment.AUTH_SECRET,
          AUTH_TRUST_HOST: baseEnvironment.AUTH_TRUST_HOST,
          DATABASE_URL: databaseUrl,
          LAB_INSTANCE_PUBLIC_URL: baseEnvironment.LAB_INSTANCE_PUBLIC_URL,
          LAB_INSTANCE_SLUG: 'bootstrap-lab',
          QR_SIGNING_SECRET: baseEnvironment.QR_SIGNING_SECRET,
          INSTANCE_BOOTSTRAP_ENABLED: 'false',
        }),
      ),
    ).resolves.toEqual({ labId: lab.id, mode: 'validated' });
    await expect(prisma.user.count()).resolves.toBe(0);
    await expect(prisma.labMembership.count()).resolves.toBe(0);
  });

  it('rejects missing and disabled labs when bootstrap cannot activate them', async () => {
    await expect(
      registerInstance(
        prisma,
        parseInstanceEnvironment({
          AUTH_SECRET: baseEnvironment.AUTH_SECRET,
          AUTH_TRUST_HOST: baseEnvironment.AUTH_TRUST_HOST,
          DATABASE_URL: databaseUrl,
          LAB_INSTANCE_PUBLIC_URL: baseEnvironment.LAB_INSTANCE_PUBLIC_URL,
          LAB_INSTANCE_SLUG: 'missing-lab',
          QR_SIGNING_SECRET: baseEnvironment.QR_SIGNING_SECRET,
          INSTANCE_BOOTSTRAP_ENABLED: 'false',
        }),
      ),
    ).rejects.toMatchObject({ code: 'LAB_NOT_REGISTERED' });

    await prisma.lab.create({
      data: {
        slug: 'bootstrap-lab',
        name: 'Laboratorio deshabilitado',
        timezone: 'Etc/UTC',
        isActive: false,
      },
    });

    await expect(
      registerInstance(prisma, parseInstanceEnvironment(baseEnvironment)),
    ).rejects.toMatchObject({ code: 'LAB_DISABLED' });
    await expect(prisma.user.count()).resolves.toBe(0);
    await expect(prisma.labMembership.count()).resolves.toBe(0);
  });
});
