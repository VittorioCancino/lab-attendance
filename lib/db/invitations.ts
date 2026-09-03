import 'server-only';

import { argon2id, hash, verify } from 'argon2';
import {
  Prisma,
  type LabMembershipRole,
  type PrismaClient,
} from '@/app/generated/prisma/client';
import {
  generateInvitationToken,
  hashInvitationToken,
} from '@/lib/auth/invitation-token';

const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1000;

export type CreateInvitationFailure =
  | 'ACCOUNT_DISABLED'
  | 'ALREADY_INVITED'
  | 'ALREADY_MEMBER'
  | 'GLOBAL_ADMIN_ACCOUNT'
  | 'NOT_AUTHORIZED'
  | 'ROLE_CONFLICT';

export type CreateInvitationResult =
  { ok: true; token: string } | { ok: false; reason: CreateInvitationFailure };

export type AcceptInvitationFailure =
  | 'ACCOUNT_DISABLED'
  | 'ALREADY_USED'
  | 'EXPIRED'
  | 'GLOBAL_ADMIN_ACCOUNT'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'ROLE_CONFLICT';

export type AcceptInvitationResult =
  | { ok: true; role: LabMembershipRole }
  | { ok: false; reason: AcceptInvitationFailure };

export interface InvitationPreview {
  email: string;
  expiresAt: Date;
  labName: string;
  name: string;
  role: LabMembershipRole;
  status: 'ACTIVE' | 'EXPIRED' | 'INVALID';
}

class InvitationStateChangedError extends Error {}

class InvitationAcceptanceError extends Error {
  constructor(readonly reason: AcceptInvitationFailure) {
    super(reason);
    this.name = 'InvitationAcceptanceError';
  }
}

function requireNewAccountPasswordHash(
  passwordHash: string | undefined,
): string {
  if (passwordHash === undefined) {
    throw new InvitationAcceptanceError('INVALID_CREDENTIALS');
  }

  return passwordHash;
}

export async function createLabInvitation(
  client: PrismaClient,
  input: {
    email: string;
    invitedByUserId: string;
    labId: string;
    name: string;
    role: LabMembershipRole;
  },
): Promise<CreateInvitationResult> {
  const now = new Date();
  const token = generateInvitationToken();

  try {
    return await client.$transaction(async (transaction) => {
      const lab = await transaction.lab.findFirst({
        where: { id: input.labId, isActive: true },
        select: { id: true },
      });

      if (lab === null) {
        return { ok: false, reason: 'NOT_AUTHORIZED' };
      }

      const inviter = await transaction.user.findFirst({
        where: {
          id: input.invitedByUserId,
          isActive: true,
        },
        select: {
          isGlobalAdmin: true,
          memberships: {
            where: {
              isActive: true,
              labId: input.labId,
              role: 'MANAGER',
            },
            select: { userId: true },
            take: 1,
          },
        },
      });

      const isLabManager = inviter?.memberships.length === 1;

      if (
        inviter === null ||
        (!inviter.isGlobalAdmin && (!isLabManager || input.role !== 'ATTENDEE'))
      ) {
        return { ok: false, reason: 'NOT_AUTHORIZED' };
      }

      const account = await transaction.user.findUnique({
        where: { email: input.email },
        select: {
          isActive: true,
          isGlobalAdmin: true,
          memberships: {
            where: { labId: input.labId },
            select: { role: true },
            take: 1,
          },
        },
      });

      if (account?.isGlobalAdmin) {
        return { ok: false, reason: 'GLOBAL_ADMIN_ACCOUNT' };
      }

      if (account !== null && !account.isActive) {
        return { ok: false, reason: 'ACCOUNT_DISABLED' };
      }

      const existingRole = account?.memberships.at(0)?.role;

      if (existingRole === input.role) {
        return { ok: false, reason: 'ALREADY_MEMBER' };
      }

      if (existingRole !== undefined) {
        return { ok: false, reason: 'ROLE_CONFLICT' };
      }

      await transaction.labInvitation.updateMany({
        where: {
          acceptedAt: null,
          email: input.email,
          expiresAt: { lte: now },
          labId: input.labId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      const pendingInvitation = await transaction.labInvitation.findFirst({
        where: {
          acceptedAt: null,
          email: input.email,
          expiresAt: { gt: now },
          labId: input.labId,
          revokedAt: null,
        },
        select: { id: true },
      });

      if (pendingInvitation !== null) {
        return { ok: false, reason: 'ALREADY_INVITED' };
      }

      await transaction.labInvitation.create({
        data: {
          email: input.email,
          expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
          invitedByUserId: input.invitedByUserId,
          labId: input.labId,
          name: input.name,
          role: input.role,
          tokenHash: token.hash,
        },
      });

      return { ok: true, token: token.value };
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { ok: false, reason: 'ALREADY_INVITED' };
    }

    throw error;
  }
}

export async function revokeLabInvitation(
  client: PrismaClient,
  input: { invitationId: string; labId: string; role: LabMembershipRole },
): Promise<boolean> {
  const update = await client.labInvitation.updateMany({
    where: {
      acceptedAt: null,
      id: input.invitationId,
      lab: { isActive: true },
      labId: input.labId,
      revokedAt: null,
      role: input.role,
    },
    data: { revokedAt: new Date() },
  });

  return update.count === 1;
}

export async function getInvitationPreview(
  client: PrismaClient,
  token: string,
  labId: string,
): Promise<InvitationPreview | null> {
  const invitation = await client.labInvitation.findFirst({
    where: { labId, tokenHash: hashInvitationToken(token) },
    select: {
      acceptedAt: true,
      email: true,
      expiresAt: true,
      lab: { select: { isActive: true, name: true } },
      name: true,
      revokedAt: true,
      role: true,
    },
  });

  if (!invitation?.lab.isActive) {
    return null;
  }

  const isTerminal =
    invitation.acceptedAt !== null || invitation.revokedAt !== null;
  const isExpired = invitation.expiresAt.getTime() <= Date.now();

  return {
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    labName: invitation.lab.name,
    name: invitation.name,
    role: invitation.role,
    status: isTerminal ? 'INVALID' : isExpired ? 'EXPIRED' : 'ACTIVE',
  };
}

async function acceptLabInvitationAttempt(
  client: PrismaClient,
  input: { labId: string; password: string; token: string },
  retryAccountConflict: boolean,
): Promise<AcceptInvitationResult> {
  const tokenHash = hashInvitationToken(input.token);
  const now = new Date();
  const invitation = await client.labInvitation.findFirst({
    where: { labId: input.labId, tokenHash },
    select: {
      acceptedAt: true,
      email: true,
      expiresAt: true,
      lab: { select: { isActive: true } },
      name: true,
      revokedAt: true,
    },
  });

  if (!invitation?.lab.isActive) {
    return { ok: false, reason: 'INVALID_TOKEN' };
  }

  if (invitation.acceptedAt !== null || invitation.revokedAt !== null) {
    return { ok: false, reason: 'ALREADY_USED' };
  }

  if (invitation.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'EXPIRED' };
  }

  const existingAccount = await client.user.findUnique({
    where: { email: invitation.email },
    select: {
      id: true,
      isActive: true,
      isGlobalAdmin: true,
      passwordHash: true,
    },
  });

  if (existingAccount?.isGlobalAdmin) {
    return { ok: false, reason: 'GLOBAL_ADMIN_ACCOUNT' };
  }

  if (existingAccount?.isActive === false) {
    return { ok: false, reason: 'ACCOUNT_DISABLED' };
  }

  if (existingAccount !== null) {
    const passwordMatches = await verify(
      existingAccount.passwordHash,
      input.password,
    ).catch(() => false);

    if (!passwordMatches) {
      return { ok: false, reason: 'INVALID_CREDENTIALS' };
    }
  }

  const passwordHash =
    existingAccount === null
      ? await hash(input.password, { type: argon2id })
      : undefined;

  try {
    return await client.$transaction(async (transaction) => {
      const activeInvitation = await transaction.labInvitation.findFirst({
        where: {
          acceptedAt: null,
          expiresAt: { gt: now },
          lab: { isActive: true },
          labId: input.labId,
          revokedAt: null,
          tokenHash,
        },
        select: {
          email: true,
          id: true,
          labId: true,
          name: true,
          role: true,
        },
      });

      if (activeInvitation === null) {
        throw new InvitationStateChangedError();
      }

      const transactionAccount = await transaction.user.findUnique({
        where: { email: activeInvitation.email },
        select: {
          id: true,
          isActive: true,
          isGlobalAdmin: true,
          passwordHash: true,
        },
      });

      if (transactionAccount !== null) {
        const passwordMatches = await verify(
          transactionAccount.passwordHash,
          input.password,
        ).catch(() => false);

        if (!passwordMatches) {
          throw new InvitationAcceptanceError('INVALID_CREDENTIALS');
        }
      }

      const account =
        transactionAccount ??
        (await transaction.user.create({
          data: {
            email: activeInvitation.email,
            name: activeInvitation.name,
            passwordHash: requireNewAccountPasswordHash(passwordHash),
          },
          select: {
            id: true,
            isActive: true,
            isGlobalAdmin: true,
          },
        }));

      if (account.isGlobalAdmin) {
        throw new InvitationAcceptanceError('GLOBAL_ADMIN_ACCOUNT');
      }

      if (!account.isActive) {
        throw new InvitationAcceptanceError('ACCOUNT_DISABLED');
      }

      const membership = await transaction.labMembership.findUnique({
        where: {
          labId_userId: {
            labId: activeInvitation.labId,
            userId: account.id,
          },
        },
        select: { role: true },
      });

      if (membership !== null && membership.role !== activeInvitation.role) {
        throw new InvitationAcceptanceError('ROLE_CONFLICT');
      }

      await transaction.labMembership.upsert({
        where: {
          labId_userId: {
            labId: activeInvitation.labId,
            userId: account.id,
          },
        },
        update: { isActive: true },
        create: {
          labId: activeInvitation.labId,
          role: activeInvitation.role,
          userId: account.id,
        },
      });

      const acceptedAt = new Date();
      const acceptance = await transaction.labInvitation.updateMany({
        where: {
          acceptedAt: null,
          email: activeInvitation.email,
          expiresAt: { gt: acceptedAt },
          id: activeInvitation.id,
          lab: { isActive: true },
          labId: activeInvitation.labId,
          revokedAt: null,
          role: activeInvitation.role,
          tokenHash,
        },
        data: {
          acceptedAt,
          acceptedByUserId: account.id,
        },
      });

      if (acceptance.count !== 1) {
        throw new InvitationStateChangedError();
      }

      return { ok: true, role: activeInvitation.role };
    });
  } catch (error: unknown) {
    if (error instanceof InvitationStateChangedError) {
      return { ok: false, reason: 'ALREADY_USED' };
    }

    if (error instanceof InvitationAcceptanceError) {
      return { ok: false, reason: error.reason };
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      if (retryAccountConflict) {
        return acceptLabInvitationAttempt(client, input, false);
      }

      return { ok: false, reason: 'ALREADY_USED' };
    }

    throw error;
  }
}

export async function acceptLabInvitation(
  client: PrismaClient,
  input: { labId: string; password: string; token: string },
): Promise<AcceptInvitationResult> {
  return acceptLabInvitationAttempt(client, input, true);
}
