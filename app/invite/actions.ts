'use server';

import { redirect } from 'next/navigation';

import { signOut } from '@/lib/auth/auth';
import { acceptLabInvitation } from '@/lib/db/invitations';
import { prisma } from '@/lib/db/prisma';
import { consumeRateLimit } from '@/lib/db/rate-limits';
import { parseServerEnvironment } from '@/lib/env';
import { logSecurityAudit } from '@/lib/logging/security-audit';
import {
  acceptInvitationSchema,
  type InvitationAcceptanceState,
} from '@/lib/types/membership.types';
import { getCurrentLab } from '@/lib/tenant/current-lab';

export async function acceptInvitationAction(
  _previousState: InvitationAcceptanceState,
  formData: FormData,
): Promise<InvitationAcceptanceState> {
  const parsed = acceptInvitationSchema.safeParse({
    confirmation: formData.get('confirmation'),
    password: formData.get('password'),
    token: formData.get('token'),
  });

  if (!parsed.success) {
    return {
      error:
        'Use una contraseña de al menos 12 caracteres y confirme el mismo valor.',
    };
  }

  const lab = await getCurrentLab();
  const environment = parseServerEnvironment(process.env);
  const rateLimit = await consumeRateLimit(prisma, {
    action: 'INVITATION_ACCEPTANCE',
    labId: lab.id,
    secret: environment.AUTH_SECRET,
    subject: parsed.data.token,
  });

  if (rateLimit.status !== 'ALLOWED') {
    logSecurityAudit({
      event: 'INVITATION',
      labId: lab.id,
      operation: 'ACCEPT',
      outcome: rateLimit.status === 'LIMITED' ? 'REJECTED' : 'FAILED',
      reason:
        rateLimit.status === 'LIMITED'
          ? 'RATE_LIMITED'
          : 'DEPENDENCY_UNAVAILABLE',
    });

    return {
      error:
        'No fue posible aceptar la invitación. Revise el enlace y la contraseña ingresada.',
    };
  }

  const result = await acceptLabInvitation(prisma, {
    labId: lab.id,
    password: parsed.data.password,
    token: parsed.data.token,
  });

  if (!result.ok) {
    logSecurityAudit({
      event: 'INVITATION',
      labId: lab.id,
      operation: 'ACCEPT',
      outcome: 'REJECTED',
      reason: 'DOMAIN_REJECTED',
    });

    return {
      error:
        'No fue posible aceptar la invitación. Revise el enlace y la contraseña ingresada.',
    };
  }

  logSecurityAudit({
    event: 'INVITATION',
    labId: lab.id,
    operation: 'ACCEPT',
    outcome: 'SUCCEEDED',
    reason: 'ACCEPTED',
    role: result.role,
  });

  redirect(
    `/invite/accepted?access=${result.role === 'ATTENDEE' ? 'attendance' : 'staff'}`,
  );
}

export async function startInvitationSessionAction(): Promise<void> {
  await signOut({ redirectTo: '/auth/signin?invitationAccepted=true' });
}
