import { verify } from 'argon2';
import type { PrismaClient } from '@/app/generated/prisma/client';
import { findLoginAccount, type UserAccessLevel } from '@/lib/db/user-access';
import type { LoginCredentials, LoginSurface } from '@/lib/types/auth.types';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$mvDjyQYSf/qvlPzsjZVwag$2vOW71UFFRzB148OkjmOqZyJC6pv08FKRpZmFuv1Kug';

export interface AuthenticatedIdentity {
  access: UserAccessLevel;
  email: string;
  id: string;
  labId: string;
  name: string;
  sessionVersion: number;
}

export function canUseLoginSurface(
  access: UserAccessLevel,
  surface: LoginSurface,
): boolean {
  return surface === 'ATTENDANCE'
    ? access === 'ATTENDEE'
    : access === 'GLOBAL_ADMIN' || access === 'MANAGER';
}

export async function verifyLoginCredentials(
  client: PrismaClient,
  labId: string,
  credentials: LoginCredentials,
): Promise<AuthenticatedIdentity | null> {
  const account = await findLoginAccount(client, credentials.email, labId);

  // Keep unknown-account verification close to the valid-account timing path.
  const passwordMatches = await verify(
    account?.passwordHash ?? DUMMY_PASSWORD_HASH,
    credentials.password,
  ).catch(() => false);

  if (account === null || !account.isActive || !passwordMatches) {
    return null;
  }

  const access = account.isGlobalAdmin
    ? 'GLOBAL_ADMIN'
    : account.membershipRole;

  if (access === null) {
    return null;
  }

  return {
    access,
    email: account.email,
    id: account.id,
    labId,
    name: account.name,
    sessionVersion: account.sessionVersion,
  };
}
