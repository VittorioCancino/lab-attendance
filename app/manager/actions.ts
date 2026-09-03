'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { signOut } from '@/lib/auth/auth';
import { requireLabManager } from '@/lib/auth/require-lab-manager';
import { createLabInvitation, revokeLabInvitation } from '@/lib/db/invitations';
import { setMembershipStatus } from '@/lib/db/memberships';
import { prisma } from '@/lib/db/prisma';
import { logSecurityAudit } from '@/lib/logging/security-audit';
import {
  createInvitationSchema,
  membershipStatusSchema,
  revokeInvitationSchema,
  type InvitationActionState,
} from '@/lib/types/membership.types';

const MANAGER_USERS_PATH = '/manager/users';

export async function managerLogoutAction(): Promise<void> {
  await signOut({ redirectTo: '/auth/signin' });
}

export async function createAttendeeInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const context = await requireLabManager();
  const submittedEmail = formData.get('email');
  const submittedName = formData.get('name');
  const submittedValues = {
    email: typeof submittedEmail === 'string' ? submittedEmail : '',
    name: typeof submittedName === 'string' ? submittedName : '',
  };
  const parsed = createInvitationSchema.safeParse({
    email: submittedValues.email,
    name: submittedValues.name,
    role: 'ATTENDEE',
  });

  if (!parsed.success) {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'INVITATION',
      labId: context.lab.id,
      operation: 'CREATE',
      outcome: 'REJECTED',
      reason: 'INVALID_INPUT',
    });

    return {
      error: 'Revise el nombre y el correo electrónico ingresados.',
      values: submittedValues,
    };
  }

  const result = await createLabInvitation(prisma, {
    email: parsed.data.email,
    invitedByUserId: context.user.id,
    labId: context.lab.id,
    name: parsed.data.name,
    role: 'ATTENDEE',
  });

  if (!result.ok) {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'INVITATION',
      labId: context.lab.id,
      operation: 'CREATE',
      outcome: 'REJECTED',
      reason: 'DOMAIN_REJECTED',
      role: 'ATTENDEE',
    });

    return {
      error: 'No fue posible crear la invitación con los datos proporcionados.',
      values: submittedValues,
    };
  }

  revalidatePath(MANAGER_USERS_PATH);
  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'INVITATION',
    labId: context.lab.id,
    operation: 'CREATE',
    outcome: 'SUCCEEDED',
    reason: 'CREATED',
    role: 'ATTENDEE',
  });

  return {
    invitationPath: `/invite/${result.token}`,
    success:
      'Invitación creada. Copie el enlace ahora; el token no podrá recuperarse después.',
  };
}

export async function revokeAttendeeInvitationAction(
  formData: FormData,
): Promise<void> {
  const context = await requireLabManager();
  const parsed = revokeInvitationSchema.safeParse({
    invitationId: formData.get('invitationId'),
    role: 'ATTENDEE',
  });

  if (!parsed.success) {
    return;
  }

  const revoked = await revokeLabInvitation(prisma, {
    invitationId: parsed.data.invitationId,
    labId: context.lab.id,
    role: 'ATTENDEE',
  });

  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'INVITATION',
    invitationId: parsed.data.invitationId,
    labId: context.lab.id,
    operation: 'REVOKE',
    outcome: revoked ? 'SUCCEEDED' : 'REJECTED',
    reason: revoked ? 'REVOKED' : 'STATE_CHANGED',
    role: 'ATTENDEE',
  });

  revalidatePath(MANAGER_USERS_PATH);
  redirect(
    `${MANAGER_USERS_PATH}?notice=${revoked ? 'invitation-revoked' : 'state-changed'}`,
  );
}

export async function setAttendeeMembershipStatusAction(
  formData: FormData,
): Promise<void> {
  const context = await requireLabManager();
  const parsed = membershipStatusSchema.safeParse({
    active: formData.get('active'),
    role: 'ATTENDEE',
    userId: formData.get('userId'),
  });

  if (!parsed.success) {
    return;
  }

  const updated = await setMembershipStatus(prisma, {
    active: parsed.data.active,
    labId: context.lab.id,
    role: 'ATTENDEE',
    userId: parsed.data.userId,
  });

  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'MEMBERSHIP',
    labId: context.lab.id,
    operation: parsed.data.active ? 'ACTIVATE' : 'DEACTIVATE',
    outcome: updated ? 'SUCCEEDED' : 'REJECTED',
    reason: updated ? 'UPDATED' : 'STATE_CHANGED',
    role: 'ATTENDEE',
    targetUserId: parsed.data.userId,
  });

  revalidatePath(MANAGER_USERS_PATH);
  redirect(
    `${MANAGER_USERS_PATH}?notice=${updated ? 'membership-updated' : 'state-changed'}`,
  );
}
