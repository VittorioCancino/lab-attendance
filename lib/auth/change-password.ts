import { argon2id, hash, verify } from 'argon2';
import type { PrismaClient } from '@/app/generated/prisma/client';

export type ChangePasswordResult =
  'ACCOUNT_UNAVAILABLE' | 'CHANGED' | 'CONFLICT' | 'CURRENT_PASSWORD_INVALID';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  userId: string;
}

export async function changeGlobalAdministratorPassword(
  client: PrismaClient,
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const account = await client.user.findFirst({
    where: {
      id: input.userId,
      isActive: true,
      isGlobalAdmin: true,
    },
    select: {
      passwordHash: true,
      sessionVersion: true,
    },
  });

  if (account === null) {
    return 'ACCOUNT_UNAVAILABLE';
  }

  const passwordMatches = await verify(
    account.passwordHash,
    input.currentPassword,
  ).catch(() => false);

  if (!passwordMatches) {
    return 'CURRENT_PASSWORD_INVALID';
  }

  const passwordHash = await hash(input.newPassword, { type: argon2id });
  const update = await client.user.updateMany({
    where: {
      id: input.userId,
      passwordHash: account.passwordHash,
      sessionVersion: account.sessionVersion,
    },
    data: {
      passwordHash,
      sessionVersion: { increment: 1 },
    },
  });

  return update.count === 1 ? 'CHANGED' : 'CONFLICT';
}
