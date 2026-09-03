'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireGlobalAdministrator } from '@/lib/auth/require-global-admin';
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

function getManagementPath(role: 'ATTENDEE' | 'MANAGER'): string {
  return role === 'MANAGER' ? '/admin/managers' : '/admin/users';
}

export async function createInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const context = await requireGlobalAdministrator();
  const submittedEmail = formData.get('email');
  const submittedName = formData.get('name');
  const submittedValues = {
    email: typeof submittedEmail === 'string' ? submittedEmail : '',
    name: typeof submittedName === 'string' ? submittedName : '',
  };
  const parsed = createInvitationSchema.safeParse({
    email: submittedValues.email,
    name: submittedValues.name,
    role: formData.get('role'),
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
    role: parsed.data.role,
  });

  if (!result.ok) {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'INVITATION',
      labId: context.lab.id,
      operation: 'CREATE',
      outcome: 'REJECTED',
      reason: 'DOMAIN_REJECTED',
      role: parsed.data.role,
    });

    return {
      error: 'No fue posible crear la invitación con los datos proporcionados.',
      values: submittedValues,
    };
  }

  revalidatePath(getManagementPath(parsed.data.role));
  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'INVITATION',
    labId: context.lab.id,
    operation: 'CREATE',
    outcome: 'SUCCEEDED',
    reason: 'CREATED',
    role: parsed.data.role,
  });

  return {
    invitationPath: `/invite/${result.token}`,
    success:
      'Invitación creada. Copie el enlace ahora; el token no podrá recuperarse después.',
  };
}

export async function revokeInvitationAction(
  formData: FormData,
): Promise<void> {
  const context = await requireGlobalAdministrator();
  const parsed = revokeInvitationSchema.safeParse({
    invitationId: formData.get('invitationId'),
    role: formData.get('role'),
  });

  if (!parsed.success) {
    return;
  }

  const revoked = await revokeLabInvitation(prisma, {
    invitationId: parsed.data.invitationId,
    labId: context.lab.id,
    role: parsed.data.role,
  });
  const path = getManagementPath(parsed.data.role);

  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'INVITATION',
    invitationId: parsed.data.invitationId,
    labId: context.lab.id,
    operation: 'REVOKE',
    outcome: revoked ? 'SUCCEEDED' : 'REJECTED',
    reason: revoked ? 'REVOKED' : 'STATE_CHANGED',
    role: parsed.data.role,
  });

  revalidatePath(path);
  redirect(
    `${path}?notice=${revoked ? 'invitation-revoked' : 'state-changed'}`,
  );
}

export async function setMembershipStatusAction(
  formData: FormData,
): Promise<void> {
  const context = await requireGlobalAdministrator();
  const parsed = membershipStatusSchema.safeParse({
    active: formData.get('active'),
    role: formData.get('role'),
    userId: formData.get('userId'),
  });

  if (!parsed.success) {
    return;
  }

  const updated = await setMembershipStatus(prisma, {
    active: parsed.data.active,
    labId: context.lab.id,
    role: parsed.data.role,
    userId: parsed.data.userId,
  });
  const path = getManagementPath(parsed.data.role);

  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'MEMBERSHIP',
    labId: context.lab.id,
    operation: parsed.data.active ? 'ACTIVATE' : 'DEACTIVATE',
    outcome: updated ? 'SUCCEEDED' : 'REJECTED',
    reason: updated ? 'UPDATED' : 'STATE_CHANGED',
    role: parsed.data.role,
    targetUserId: parsed.data.userId,
  });

  revalidatePath(path);
  redirect(
    `${path}?notice=${updated ? 'membership-updated' : 'state-changed'}`,
  );
}
