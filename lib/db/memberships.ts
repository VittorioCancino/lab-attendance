import 'server-only';

import type {
  LabMembershipRole,
  PrismaClient,
} from '@/app/generated/prisma/client';

export interface ManagedMembership {
  createdAt: Date;
  email: string;
  isAccountActive: boolean;
  isActive: boolean;
  name: string;
  userId: string;
}

export interface PendingInvitation {
  email: string;
  expiresAt: Date;
  id: string;
  isExpired: boolean;
  name: string;
}

export interface LabAccessList {
  invitations: PendingInvitation[];
  memberships: ManagedMembership[];
}

export async function listLabAccess(
  client: PrismaClient,
  labId: string,
  role: LabMembershipRole,
): Promise<LabAccessList> {
  const [memberships, invitations] = await Promise.all([
    client.labMembership.findMany({
      where: { labId, role },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select: {
        createdAt: true,
        isActive: true,
        user: {
          select: {
            email: true,
            isActive: true,
            name: true,
          },
        },
        userId: true,
      },
    }),
    client.labInvitation.findMany({
      where: {
        acceptedAt: null,
        labId,
        revokedAt: null,
        role,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        email: true,
        expiresAt: true,
        id: true,
        name: true,
      },
    }),
  ]);

  return {
    invitations: invitations.map((invitation) => ({
      ...invitation,
      isExpired: invitation.expiresAt.getTime() <= Date.now(),
    })),
    memberships: memberships.map((membership) => ({
      createdAt: membership.createdAt,
      email: membership.user.email,
      isAccountActive: membership.user.isActive,
      isActive: membership.isActive,
      name: membership.user.name,
      userId: membership.userId,
    })),
  };
}

export async function setMembershipStatus(
  client: PrismaClient,
  input: {
    active: boolean;
    labId: string;
    role: LabMembershipRole;
    userId: string;
  },
): Promise<boolean> {
  const update = await client.labMembership.updateMany({
    where: {
      lab: { isActive: true },
      labId: input.labId,
      role: input.role,
      user: input.active ? { isActive: true } : undefined,
      userId: input.userId,
    },
    data: { isActive: input.active },
  });

  return update.count === 1;
}
