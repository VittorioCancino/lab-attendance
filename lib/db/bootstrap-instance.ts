import { argon2id, hash } from 'argon2';

import type { PrismaClient } from '@/app/generated/prisma/client';
import type { InstanceEnvironment } from '@/lib/env';

export type InstanceRegistrationErrorCode =
  'ADMIN_PASSWORD_REQUIRED' | 'LAB_DISABLED' | 'LAB_NOT_REGISTERED';

export class InstanceRegistrationError extends Error {
  constructor(
    readonly code: InstanceRegistrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InstanceRegistrationError';
  }
}

export interface InstanceRegistrationResult {
  labId: string;
  mode: 'registered' | 'validated';
  administratorId?: string;
}

export async function registerInstance(
  prisma: PrismaClient,
  environment: InstanceEnvironment,
): Promise<InstanceRegistrationResult> {
  if (!environment.bootstrapEnabled) {
    const lab = await prisma.lab.findUnique({
      where: { slug: environment.LAB_INSTANCE_SLUG },
      select: { id: true, isActive: true },
    });

    if (lab === null) {
      throw new InstanceRegistrationError(
        'LAB_NOT_REGISTERED',
        'The configured lab has not been registered.',
      );
    }

    if (!lab.isActive) {
      throw new InstanceRegistrationError(
        'LAB_DISABLED',
        'The configured lab is disabled.',
      );
    }

    return { labId: lab.id, mode: 'validated' };
  }

  const existingAdministrator = await prisma.user.findUnique({
    where: { email: environment.adminEmail },
    select: { id: true },
  });

  if (
    existingAdministrator === null &&
    environment.adminInitialPassword === undefined
  ) {
    throw new InstanceRegistrationError(
      'ADMIN_PASSWORD_REQUIRED',
      'An initial administrator password is required to create the account.',
    );
  }

  const passwordHash =
    existingAdministrator === null &&
    environment.adminInitialPassword !== undefined
      ? await hash(environment.adminInitialPassword, { type: argon2id })
      : undefined;

  return prisma.$transaction(async (transaction) => {
    const lab = await transaction.lab.upsert({
      where: { slug: environment.LAB_INSTANCE_SLUG },
      update: {},
      create: {
        slug: environment.LAB_INSTANCE_SLUG,
        name: environment.labName,
        timezone: environment.labTimezone,
      },
      select: { id: true, isActive: true },
    });

    if (!lab.isActive) {
      throw new InstanceRegistrationError(
        'LAB_DISABLED',
        'The configured lab is disabled.',
      );
    }

    const administrator =
      passwordHash === undefined
        ? await transaction.user.update({
            where: { email: environment.adminEmail },
            data: { isActive: true, isGlobalAdmin: true },
            select: { id: true },
          })
        : await transaction.user.upsert({
            where: { email: environment.adminEmail },
            update: { isActive: true, isGlobalAdmin: true },
            create: {
              email: environment.adminEmail,
              name: environment.adminName,
              passwordHash,
              isGlobalAdmin: true,
            },
            select: { id: true },
          });

    return {
      labId: lab.id,
      administratorId: administrator.id,
      mode: 'registered',
    };
  });
}
