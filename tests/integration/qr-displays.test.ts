import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LabMembershipRole } from '@/app/generated/prisma/client';
import { createPrismaClient } from '@/lib/db/client';
import {
  createQrDisplayActivation,
  getValidQrDisplaySession,
  listQrDisplays,
  redeemQrDisplayActivation,
  revokeQrDisplay,
} from '@/lib/db/qr-displays';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

const prisma = createPrismaClient(databaseUrl);
const secret = 'qr-signing-secret-for-integration-tests'.repeat(2);
const now = new Date('2026-08-28T12:00:00.000Z');

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
      passwordHash: 'not-used-in-domain-tests',
    },
  });

  await prisma.labMembership.create({
    data: { labId, role, userId: user.id },
  });

  return user;
}

async function createActivation(labId: string, managerUserId: string) {
  const result = await createQrDisplayActivation(prisma, {
    createdByUserId: managerUserId,
    label: 'Entrada principal',
    labId,
    now,
    secret,
  });

  if (!result.ok) {
    throw new Error('Expected display activation creation to succeed.');
  }

  const activation = await prisma.qrDisplayActivation.findFirstOrThrow({
    where: { labId },
  });

  return { activation, ...result };
}

describe('QR display authorization', () => {
  it('allows only an active same-lab manager to create an activation', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const manager = await createMember(
      'manager@test.local',
      firstLab.id,
      LabMembershipRole.MANAGER,
    );
    const attendee = await createMember(
      'attendee@test.local',
      firstLab.id,
      LabMembershipRole.ATTENDEE,
    );
    const result = await createQrDisplayActivation(prisma, {
      createdByUserId: manager.id,
      label: 'Entrada norte',
      labId: firstLab.id,
      now,
      secret,
    });

    expect(result).toMatchObject({ ok: true });

    if (!result.ok) {
      return;
    }

    expect(result.code).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/,
    );
    expect(result.expiresAt).toEqual(new Date(now.getTime() + 10 * 60_000));

    const stored = await prisma.qrDisplayActivation.findFirstOrThrow();

    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.codeHash).not.toContain(result.code.replaceAll('-', ''));
    await expect(
      createQrDisplayActivation(prisma, {
        createdByUserId: attendee.id,
        label: 'Pantalla de asistente',
        labId: firstLab.id,
        now,
        secret,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
    await expect(
      createQrDisplayActivation(prisma, {
        createdByUserId: manager.id,
        label: 'Pantalla de otro laboratorio',
        labId: secondLab.id,
        now,
        secret,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });

    await prisma.labMembership.update({
      where: {
        labId_userId: { labId: firstLab.id, userId: manager.id },
      },
      data: { isActive: false },
    });
    await expect(
      createQrDisplayActivation(prisma, {
        createdByUserId: manager.id,
        label: 'Pantalla sin autorización',
        labId: firstLab.id,
        now,
        secret,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
  });

  it('redeems a lab-bound code once and validates only its raw capability', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const manager = await createMember(
      'manager@test.local',
      firstLab.id,
      LabMembershipRole.MANAGER,
    );
    const { code } = await createActivation(firstLab.id, manager.id);
    const activatedAt = new Date(now.getTime() + 60_000);

    await expect(
      redeemQrDisplayActivation(prisma, {
        code,
        labId: secondLab.id,
        now: activatedAt,
        secret,
      }),
    ).resolves.toEqual({ ok: false });

    const redemption = await redeemQrDisplayActivation(prisma, {
      code: code.toLowerCase(),
      labId: firstLab.id,
      now: activatedAt,
      secret,
    });

    expect(redemption).toMatchObject({
      expiresAt: new Date(activatedAt.getTime() + 12 * 60 * 60_000),
      label: 'Entrada principal',
      ok: true,
    });

    if (!redemption.ok) {
      return;
    }

    const storedSession = await prisma.qrDisplaySession.findFirstOrThrow();

    expect(storedSession.tokenHash).not.toBe(redemption.token);
    await expect(
      getValidQrDisplaySession(prisma, {
        labId: firstLab.id,
        now: activatedAt,
        secret,
        token: redemption.token,
      }),
    ).resolves.toEqual({
      expiresAt: redemption.expiresAt,
      label: 'Entrada principal',
    });
    await expect(
      getValidQrDisplaySession(prisma, {
        labId: secondLab.id,
        now: activatedAt,
        secret,
        token: redemption.token,
      }),
    ).resolves.toBeNull();
    await expect(
      getValidQrDisplaySession(prisma, {
        labId: firstLab.id,
        now: activatedAt,
        secret: 'different-secret'.repeat(3),
        token: redemption.token,
      }),
    ).resolves.toBeNull();
    await expect(
      redeemQrDisplayActivation(prisma, {
        code,
        labId: firstLab.id,
        now: activatedAt,
        secret,
      }),
    ).resolves.toEqual({ ok: false });
    await expect(
      getValidQrDisplaySession(prisma, {
        labId: firstLab.id,
        now: redemption.expiresAt,
        secret,
        token: redemption.token,
      }),
    ).resolves.toBeNull();
  });

  it('permits only one concurrent redemption of an activation code', async () => {
    const lab = await createLab('first-lab');
    const manager = await createMember(
      'manager@test.local',
      lab.id,
      LabMembershipRole.MANAGER,
    );
    const { code } = await createActivation(lab.id, manager.id);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        redeemQrDisplayActivation(prisma, {
          code,
          labId: lab.id,
          now: new Date(now.getTime() + 60_000),
          secret,
        }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    await expect(prisma.qrDisplaySession.count()).resolves.toBe(1);
  });

  it('scopes listing and revocation to an authorized manager and lab', async () => {
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
    const { activation, code } = await createActivation(
      firstLab.id,
      firstManager.id,
    );
    const redemption = await redeemQrDisplayActivation(prisma, {
      code,
      labId: firstLab.id,
      now: new Date(now.getTime() + 60_000),
      secret,
    });

    expect(redemption.ok).toBe(true);
    await expect(listQrDisplays(prisma, secondLab.id, now)).resolves.toEqual(
      [],
    );
    await expect(
      revokeQrDisplay(prisma, {
        activationId: activation.id,
        labId: secondLab.id,
        managerUserId: secondManager.id,
        now: new Date(now.getTime() + 2 * 60_000),
      }),
    ).resolves.toBe('NOT_FOUND');
    await expect(
      revokeQrDisplay(prisma, {
        activationId: activation.id,
        labId: firstLab.id,
        managerUserId: secondManager.id,
        now: new Date(now.getTime() + 2 * 60_000),
      }),
    ).resolves.toBe('NOT_AUTHORIZED');
    await expect(
      revokeQrDisplay(prisma, {
        activationId: activation.id,
        labId: firstLab.id,
        managerUserId: firstManager.id,
        now: new Date(now.getTime() + 2 * 60_000),
      }),
    ).resolves.toBe('REVOKED');

    if (!redemption.ok) {
      return;
    }

    await expect(
      getValidQrDisplaySession(prisma, {
        labId: firstLab.id,
        now: new Date(now.getTime() + 2 * 60_000),
        secret,
        token: redemption.token,
      }),
    ).resolves.toBeNull();
    await expect(
      listQrDisplays(prisma, firstLab.id, now),
    ).resolves.toMatchObject([
      {
        activationId: activation.id,
        canRevoke: false,
        status: 'REVOKED',
      },
    ]);
  });

  it('revokes a pending activation before it can be redeemed', async () => {
    const lab = await createLab('first-lab');
    const manager = await createMember(
      'manager@test.local',
      lab.id,
      LabMembershipRole.MANAGER,
    );
    const { activation, code } = await createActivation(lab.id, manager.id);

    await expect(
      revokeQrDisplay(prisma, {
        activationId: activation.id,
        labId: lab.id,
        managerUserId: manager.id,
        now: new Date(now.getTime() + 60_000),
      }),
    ).resolves.toBe('REVOKED');
    await expect(
      redeemQrDisplayActivation(prisma, {
        code,
        labId: lab.id,
        now: new Date(now.getTime() + 2 * 60_000),
        secret,
      }),
    ).resolves.toEqual({ ok: false });
    await expect(listQrDisplays(prisma, lab.id, now)).resolves.toMatchObject([
      {
        activationId: activation.id,
        canRevoke: false,
        status: 'REVOKED',
      },
    ]);
  });
});
