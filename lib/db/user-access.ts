import 'server-only';

import type {
  LabMembershipRole,
  PrismaClient,
} from '@/app/generated/prisma/client';

export type UserAccessLevel =
  | 'GLOBAL_ADMIN'
  | typeof LabMembershipRole.MANAGER
  | typeof LabMembershipRole.ATTENDEE;

export interface LoginAccount {
  email: string;
  id: string;
  isActive: boolean;
  isGlobalAdmin: boolean;
  membershipRole: LabMembershipRole | null;
  name: string;
  passwordHash: string;
  sessionVersion: number;
}

export interface AuthorizedUser {
  access: UserAccessLevel;
  email: string;
  id: string;
  name: string;
  sessionVersion: number;
}

export async function findLoginAccount(
  client: PrismaClient,
  email: string,
  labId: string,
): Promise<LoginAccount | null> {
  const account = await client.user.findUnique({
    where: { email },
    select: {
      email: true,
      id: true,
      isActive: true,
      isGlobalAdmin: true,
      memberships: {
        where: { isActive: true, labId },
        select: { role: true },
        take: 1,
      },
      name: true,
      passwordHash: true,
      sessionVersion: true,
    },
  });

  if (account === null) {
    return null;
  }

  return {
    email: account.email,
    id: account.id,
    isActive: account.isActive,
    isGlobalAdmin: account.isGlobalAdmin,
    membershipRole: account.memberships[0]?.role ?? null,
    name: account.name,
    passwordHash: account.passwordHash,
    sessionVersion: account.sessionVersion,
  };
}

export async function getAuthorizedUser(
  client: PrismaClient,
  userId: string,
  labId: string,
): Promise<AuthorizedUser | null> {
  const account = await client.user.findFirst({
    where: { id: userId, isActive: true },
    select: {
      email: true,
      id: true,
      isGlobalAdmin: true,
      memberships: {
        where: { isActive: true, labId },
        select: { role: true },
        take: 1,
      },
      name: true,
      sessionVersion: true,
    },
  });

  if (account === null) {
    return null;
  }

  if (account.isGlobalAdmin) {
    return {
      access: 'GLOBAL_ADMIN',
      email: account.email,
      id: account.id,
      name: account.name,
      sessionVersion: account.sessionVersion,
    };
  }

  const membershipRole = account.memberships.at(0)?.role;

  if (membershipRole === undefined) {
    return null;
  }

  return {
    access: membershipRole,
    email: account.email,
    id: account.id,
    name: account.name,
    sessionVersion: account.sessionVersion,
  };
}
