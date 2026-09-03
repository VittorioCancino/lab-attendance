import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { argon2id, hash, verify } from 'argon2';

import { LabMembershipRole } from '@/app/generated/prisma/client';
import {
  acceptLabInvitation,
  createLabInvitation,
  getInvitationPreview,
  revokeLabInvitation,
} from '@/lib/db/invitations';
import { createPrismaClient } from '@/lib/db/client';
import { listLabAccess, setMembershipStatus } from '@/lib/db/memberships';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

const prisma = createPrismaClient(databaseUrl);
const accountPassword = 'existing-account-password';

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

async function createGlobalAdministrator() {
  return prisma.user.create({
    data: {
      email: 'global-admin@test.local',
      isGlobalAdmin: true,
      name: 'Administración global',
      passwordHash: await hash('global-admin-password', { type: argon2id }),
    },
  });
}

describe('lab invitation lifecycle', () => {
  it('stores only a token hash and rejects cross-lab token use', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const administrator = await createGlobalAdministrator();
    const result = await createLabInvitation(prisma, {
      email: 'person@test.local',
      invitedByUserId: administrator.id,
      labId: firstLab.id,
      name: 'Persona invitada',
      role: LabMembershipRole.ATTENDEE,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const storedInvitation = await prisma.labInvitation.findFirstOrThrow();

    expect(storedInvitation.tokenHash).not.toBe(result.token);
    await expect(
      getInvitationPreview(prisma, result.token, firstLab.id),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
    await expect(
      getInvitationPreview(prisma, result.token, secondLab.id),
    ).resolves.toBeNull();
    await expect(
      revokeLabInvitation(prisma, {
        invitationId: storedInvitation.id,
        labId: secondLab.id,
        role: LabMembershipRole.ATTENDEE,
      }),
    ).resolves.toBe(false);
    await expect(
      acceptLabInvitation(prisma, {
        labId: secondLab.id,
        password: 'new-account-password',
        token: result.token,
      }),
    ).resolves.toEqual({ ok: false, reason: 'INVALID_TOKEN' });
  });

  it('creates a new account and consumes its invitation once', async () => {
    const lab = await createLab('first-lab');
    const administrator = await createGlobalAdministrator();
    const invitation = await createLabInvitation(prisma, {
      email: 'person@test.local',
      invitedByUserId: administrator.id,
      labId: lab.id,
      name: 'Persona invitada',
      role: LabMembershipRole.ATTENDEE,
    });

    expect(invitation.ok).toBe(true);

    if (!invitation.ok) {
      return;
    }

    await expect(
      acceptLabInvitation(prisma, {
        labId: lab.id,
        password: 'new-account-password',
        token: invitation.token,
      }),
    ).resolves.toEqual({ ok: true, role: LabMembershipRole.ATTENDEE });

    const account = await prisma.user.findUniqueOrThrow({
      where: { email: 'person@test.local' },
    });
    const membership = await prisma.labMembership.findUniqueOrThrow({
      where: { labId_userId: { labId: lab.id, userId: account.id } },
    });

    await expect(
      verify(account.passwordHash, 'new-account-password'),
    ).resolves.toBe(true);
    expect(membership).toMatchObject({
      isActive: true,
      role: LabMembershipRole.ATTENDEE,
    });
    await expect(
      acceptLabInvitation(prisma, {
        labId: lab.id,
        password: 'new-account-password',
        token: invitation.token,
      }),
    ).resolves.toEqual({ ok: false, reason: 'ALREADY_USED' });
  });

  it('reuses an existing account without changing its profile or password', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const administrator = await createGlobalAdministrator();
    const passwordHash = await hash(accountPassword, { type: argon2id });
    const account = await prisma.user.create({
      data: {
        email: 'person@test.local',
        name: 'Nombre compartido',
        passwordHash,
      },
    });

    await prisma.labMembership.create({
      data: {
        labId: firstLab.id,
        role: LabMembershipRole.ATTENDEE,
        userId: account.id,
      },
    });

    const invitation = await createLabInvitation(prisma, {
      email: account.email,
      invitedByUserId: administrator.id,
      labId: secondLab.id,
      name: 'Nombre reemplazado',
      role: LabMembershipRole.MANAGER,
    });

    expect(invitation.ok).toBe(true);

    if (!invitation.ok) {
      return;
    }

    await expect(
      acceptLabInvitation(prisma, {
        labId: secondLab.id,
        password: accountPassword,
        token: invitation.token,
      }),
    ).resolves.toEqual({ ok: true, role: LabMembershipRole.MANAGER });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: account.id } }),
    ).resolves.toMatchObject({
      name: 'Nombre compartido',
      passwordHash,
    });
    await expect(prisma.labMembership.count()).resolves.toBe(2);
  });

  it('accepts simultaneous invitations for one new account in two labs', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const administrator = await createGlobalAdministrator();
    const invitationInputs = [firstLab, secondLab].map((lab) => ({
      email: 'shared-person@test.local',
      invitedByUserId: administrator.id,
      labId: lab.id,
      name: 'Persona compartida',
      role: LabMembershipRole.ATTENDEE,
    }));
    const invitations = await Promise.all(
      invitationInputs.map((input) => createLabInvitation(prisma, input)),
    );

    expect(invitations.every((invitation) => invitation.ok)).toBe(true);

    const tokens = invitations.flatMap((invitation) =>
      invitation.ok ? [invitation.token] : [],
    );
    const results = await Promise.all(
      tokens.map((token, index) =>
        acceptLabInvitation(prisma, {
          labId: invitationInputs[index].labId,
          password: 'shared-account-password',
          token,
        }),
      ),
    );

    expect(results).toEqual([
      { ok: true, role: LabMembershipRole.ATTENDEE },
      { ok: true, role: LabMembershipRole.ATTENDEE },
    ]);
    await expect(
      prisma.user.count({ where: { email: 'shared-person@test.local' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.labMembership.count({
        where: { user: { email: 'shared-person@test.local' } },
      }),
    ).resolves.toBe(2);
  });

  it('allows only one concurrent acceptance of the same invitation', async () => {
    const lab = await createLab('first-lab');
    const administrator = await createGlobalAdministrator();
    const invitation = await createLabInvitation(prisma, {
      email: 'person@test.local',
      invitedByUserId: administrator.id,
      labId: lab.id,
      name: 'Persona invitada',
      role: LabMembershipRole.ATTENDEE,
    });

    expect(invitation.ok).toBe(true);

    if (!invitation.ok) {
      return;
    }

    const input = {
      labId: lab.id,
      password: 'new-account-password',
      token: invitation.token,
    };
    const results = await Promise.all([
      acceptLabInvitation(prisma, input),
      acceptLabInvitation(prisma, input),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: 'ALREADY_USED' },
    ]);
    await expect(prisma.labMembership.count()).resolves.toBe(1);
    await expect(
      prisma.labInvitation.count({ where: { acceptedAt: { not: null } } }),
    ).resolves.toBe(1);
  });

  it('leaves no side effects after invalid existing-account credentials', async () => {
    const lab = await createLab('first-lab');
    const administrator = await createGlobalAdministrator();
    const account = await prisma.user.create({
      data: {
        email: 'person@test.local',
        name: 'Persona existente',
        passwordHash: await hash(accountPassword, { type: argon2id }),
      },
    });
    const invitation = await createLabInvitation(prisma, {
      email: account.email,
      invitedByUserId: administrator.id,
      labId: lab.id,
      name: account.name,
      role: LabMembershipRole.ATTENDEE,
    });

    expect(invitation.ok).toBe(true);

    if (!invitation.ok) {
      return;
    }

    await expect(
      acceptLabInvitation(prisma, {
        labId: lab.id,
        password: 'incorrect-password-value',
        token: invitation.token,
      }),
    ).resolves.toEqual({ ok: false, reason: 'INVALID_CREDENTIALS' });
    await expect(prisma.labMembership.count()).resolves.toBe(0);
    await expect(
      prisma.labInvitation.findFirstOrThrow(),
    ).resolves.toMatchObject({ acceptedAt: null, acceptedByUserId: null });
  });

  it('prevents duplicate pending invitations and role conflicts', async () => {
    const lab = await createLab('first-lab');
    const administrator = await createGlobalAdministrator();
    const account = await prisma.user.create({
      data: {
        email: 'member@test.local',
        name: 'Miembro existente',
        passwordHash: await hash(accountPassword, { type: argon2id }),
      },
    });

    await prisma.labMembership.create({
      data: {
        labId: lab.id,
        role: LabMembershipRole.ATTENDEE,
        userId: account.id,
      },
    });

    await expect(
      createLabInvitation(prisma, {
        email: account.email,
        invitedByUserId: administrator.id,
        labId: lab.id,
        name: account.name,
        role: LabMembershipRole.MANAGER,
      }),
    ).resolves.toEqual({ ok: false, reason: 'ROLE_CONFLICT' });

    const firstInvitation = await createLabInvitation(prisma, {
      email: 'new-person@test.local',
      invitedByUserId: administrator.id,
      labId: lab.id,
      name: 'Persona nueva',
      role: LabMembershipRole.ATTENDEE,
    });

    expect(firstInvitation.ok).toBe(true);
    await expect(
      createLabInvitation(prisma, {
        email: 'new-person@test.local',
        invitedByUserId: administrator.id,
        labId: lab.id,
        name: 'Persona nueva',
        role: LabMembershipRole.ATTENDEE,
      }),
    ).resolves.toEqual({ ok: false, reason: 'ALREADY_INVITED' });
  });

  it('supports invitation revocation and replacement after expiry', async () => {
    const lab = await createLab('first-lab');
    const administrator = await createGlobalAdministrator();
    const invitation = await createLabInvitation(prisma, {
      email: 'person@test.local',
      invitedByUserId: administrator.id,
      labId: lab.id,
      name: 'Persona invitada',
      role: LabMembershipRole.ATTENDEE,
    });

    expect(invitation.ok).toBe(true);

    if (!invitation.ok) {
      return;
    }

    const stored = await prisma.labInvitation.findFirstOrThrow();

    await expect(
      revokeLabInvitation(prisma, {
        invitationId: stored.id,
        labId: lab.id,
        role: LabMembershipRole.ATTENDEE,
      }),
    ).resolves.toBe(true);
    await expect(
      acceptLabInvitation(prisma, {
        labId: lab.id,
        password: 'new-account-password',
        token: invitation.token,
      }),
    ).resolves.toEqual({ ok: false, reason: 'ALREADY_USED' });

    const replacement = await createLabInvitation(prisma, {
      email: 'expiring@test.local',
      invitedByUserId: administrator.id,
      labId: lab.id,
      name: 'Invitación vencida',
      role: LabMembershipRole.ATTENDEE,
    });

    expect(replacement.ok).toBe(true);
    await prisma.labInvitation.updateMany({
      where: { email: 'expiring@test.local' },
      data: {
        createdAt: new Date(Date.now() - 2_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await expect(
      acceptLabInvitation(prisma, {
        labId: lab.id,
        password: 'new-account-password',
        token: replacement.ok ? replacement.token : '',
      }),
    ).resolves.toEqual({ ok: false, reason: 'EXPIRED' });
    await expect(
      createLabInvitation(prisma, {
        email: 'expiring@test.local',
        invitedByUserId: administrator.id,
        labId: lab.id,
        name: 'Invitación reemplazada',
        role: LabMembershipRole.ATTENDEE,
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('changes membership status only for the requested lab and role', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const account = await prisma.user.create({
      data: {
        email: 'person@test.local',
        name: 'Persona invitada',
        passwordHash: await hash(accountPassword, { type: argon2id }),
      },
    });

    await prisma.labMembership.create({
      data: {
        labId: firstLab.id,
        role: LabMembershipRole.ATTENDEE,
        userId: account.id,
      },
    });

    await expect(
      setMembershipStatus(prisma, {
        active: false,
        labId: secondLab.id,
        role: LabMembershipRole.ATTENDEE,
        userId: account.id,
      }),
    ).resolves.toBe(false);
    await expect(
      setMembershipStatus(prisma, {
        active: false,
        labId: firstLab.id,
        role: LabMembershipRole.MANAGER,
        userId: account.id,
      }),
    ).resolves.toBe(false);
    await expect(
      setMembershipStatus(prisma, {
        active: false,
        labId: firstLab.id,
        role: LabMembershipRole.ATTENDEE,
        userId: account.id,
      }),
    ).resolves.toBe(true);
    await expect(
      prisma.labMembership.findUniqueOrThrow({
        where: {
          labId_userId: { labId: firstLab.id, userId: account.id },
        },
      }),
    ).resolves.toMatchObject({ isActive: false });

    await prisma.user.update({
      where: { id: account.id },
      data: { isActive: false },
    });

    const access = await listLabAccess(
      prisma,
      firstLab.id,
      LabMembershipRole.ATTENDEE,
    );

    expect(access.memberships).toMatchObject([
      { isAccountActive: false, isActive: false, userId: account.id },
    ]);
    await expect(
      setMembershipStatus(prisma, {
        active: true,
        labId: firstLab.id,
        role: LabMembershipRole.ATTENDEE,
        userId: account.id,
      }),
    ).resolves.toBe(false);
  });

  it('rejects invitation and membership mutations for a disabled lab', async () => {
    const lab = await createLab('disabled-lab');
    const administrator = await createGlobalAdministrator();
    const account = await prisma.user.create({
      data: {
        email: 'person@test.local',
        name: 'Persona invitada',
        passwordHash: await hash(accountPassword, { type: argon2id }),
      },
    });
    const invitation = await createLabInvitation(prisma, {
      email: 'pending@test.local',
      invitedByUserId: administrator.id,
      labId: lab.id,
      name: 'Invitación pendiente',
      role: LabMembershipRole.ATTENDEE,
    });

    expect(invitation.ok).toBe(true);

    if (!invitation.ok) {
      return;
    }

    const storedInvitation = await prisma.labInvitation.findFirstOrThrow();

    await prisma.labMembership.create({
      data: {
        labId: lab.id,
        role: LabMembershipRole.ATTENDEE,
        userId: account.id,
      },
    });
    await prisma.lab.update({
      where: { id: lab.id },
      data: { isActive: false },
    });

    await expect(
      createLabInvitation(prisma, {
        email: 'another@test.local',
        invitedByUserId: administrator.id,
        labId: lab.id,
        name: 'Otra persona',
        role: LabMembershipRole.ATTENDEE,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
    await expect(
      revokeLabInvitation(prisma, {
        invitationId: storedInvitation.id,
        labId: lab.id,
        role: LabMembershipRole.ATTENDEE,
      }),
    ).resolves.toBe(false);
    await expect(
      setMembershipStatus(prisma, {
        active: false,
        labId: lab.id,
        role: LabMembershipRole.ATTENDEE,
        userId: account.id,
      }),
    ).resolves.toBe(false);
    await expect(
      acceptLabInvitation(prisma, {
        labId: lab.id,
        password: 'new-account-password',
        token: invitation.token,
      }),
    ).resolves.toEqual({ ok: false, reason: 'INVALID_TOKEN' });
  });
});

describe('manager invitation authorization', () => {
  it('allows a manager to invite attendees only to their own lab', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const manager = await prisma.user.create({
      data: {
        email: 'manager@test.local',
        name: 'Administración local',
        passwordHash: await hash(accountPassword, { type: argon2id }),
      },
    });

    await prisma.labMembership.create({
      data: {
        labId: firstLab.id,
        role: LabMembershipRole.MANAGER,
        userId: manager.id,
      },
    });

    await expect(
      createLabInvitation(prisma, {
        email: 'attendee@test.local',
        invitedByUserId: manager.id,
        labId: firstLab.id,
        name: 'Usuario invitado',
        role: LabMembershipRole.ATTENDEE,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createLabInvitation(prisma, {
        email: 'manager-invite@test.local',
        invitedByUserId: manager.id,
        labId: firstLab.id,
        name: 'Administrador invitado',
        role: LabMembershipRole.MANAGER,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
    await expect(
      createLabInvitation(prisma, {
        email: 'other-lab@test.local',
        invitedByUserId: manager.id,
        labId: secondLab.id,
        name: 'Usuario de otro laboratorio',
        role: LabMembershipRole.ATTENDEE,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
    await expect(prisma.labInvitation.count()).resolves.toBe(1);
    await expect(
      prisma.labInvitation.findFirstOrThrow(),
    ).resolves.toMatchObject({
      invitedByUserId: manager.id,
      labId: firstLab.id,
      role: LabMembershipRole.ATTENDEE,
    });
  });

  it('rejects attendees and inactive managers as inviters', async () => {
    const lab = await createLab('first-lab');
    const passwordHash = await hash(accountPassword, { type: argon2id });
    const [attendee, inactiveMembershipManager, inactiveAccountManager] =
      await Promise.all([
        prisma.user.create({
          data: {
            email: 'attendee@test.local',
            name: 'Usuario del laboratorio',
            passwordHash,
          },
        }),
        prisma.user.create({
          data: {
            email: 'inactive-membership@test.local',
            name: 'Administrador local inactivo',
            passwordHash,
          },
        }),
        prisma.user.create({
          data: {
            email: 'inactive-account@test.local',
            isActive: false,
            name: 'Cuenta deshabilitada',
            passwordHash,
          },
        }),
      ]);

    await prisma.labMembership.createMany({
      data: [
        {
          labId: lab.id,
          role: LabMembershipRole.ATTENDEE,
          userId: attendee.id,
        },
        {
          isActive: false,
          labId: lab.id,
          role: LabMembershipRole.MANAGER,
          userId: inactiveMembershipManager.id,
        },
        {
          labId: lab.id,
          role: LabMembershipRole.MANAGER,
          userId: inactiveAccountManager.id,
        },
      ],
    });

    for (const [index, inviter] of [
      attendee,
      inactiveMembershipManager,
      inactiveAccountManager,
    ].entries()) {
      const suffix = String(index);

      await expect(
        createLabInvitation(prisma, {
          email: `invited-${suffix}@test.local`,
          invitedByUserId: inviter.id,
          labId: lab.id,
          name: `Usuario invitado ${suffix}`,
          role: LabMembershipRole.ATTENDEE,
        }),
      ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
    }

    await expect(prisma.labInvitation.count()).resolves.toBe(0);
  });

  it('keeps the manager attendee list scoped by lab and role', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const administrator = await createGlobalAdministrator();
    const passwordHash = await hash(accountPassword, { type: argon2id });
    const [firstAttendee, secondAttendee, localManager] = await Promise.all([
      prisma.user.create({
        data: {
          email: 'first-attendee@test.local',
          name: 'Usuario del primer laboratorio',
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: 'second-attendee@test.local',
          name: 'Usuario del segundo laboratorio',
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: 'manager@test.local',
          name: 'Administrador local',
          passwordHash,
        },
      }),
    ]);

    await prisma.labMembership.createMany({
      data: [
        {
          labId: firstLab.id,
          role: LabMembershipRole.ATTENDEE,
          userId: firstAttendee.id,
        },
        {
          labId: secondLab.id,
          role: LabMembershipRole.ATTENDEE,
          userId: secondAttendee.id,
        },
        {
          labId: firstLab.id,
          role: LabMembershipRole.MANAGER,
          userId: localManager.id,
        },
      ],
    });

    await Promise.all([
      createLabInvitation(prisma, {
        email: 'pending-first@test.local',
        invitedByUserId: administrator.id,
        labId: firstLab.id,
        name: 'Invitación del primer laboratorio',
        role: LabMembershipRole.ATTENDEE,
      }),
      createLabInvitation(prisma, {
        email: 'pending-second@test.local',
        invitedByUserId: administrator.id,
        labId: secondLab.id,
        name: 'Invitación del segundo laboratorio',
        role: LabMembershipRole.ATTENDEE,
      }),
      createLabInvitation(prisma, {
        email: 'pending-manager@test.local',
        invitedByUserId: administrator.id,
        labId: firstLab.id,
        name: 'Invitación de administrador',
        role: LabMembershipRole.MANAGER,
      }),
    ]);

    const access = await listLabAccess(
      prisma,
      firstLab.id,
      LabMembershipRole.ATTENDEE,
    );

    expect(access.memberships).toHaveLength(1);
    expect(access.memberships[0]).toMatchObject({
      email: firstAttendee.email,
      userId: firstAttendee.id,
    });
    expect(access.invitations).toHaveLength(1);
    expect(access.invitations[0]).toMatchObject({
      email: 'pending-first@test.local',
    });
  });
});
