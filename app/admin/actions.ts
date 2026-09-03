'use server';

import { signOut } from '@/lib/auth/auth';
import { changeGlobalAdministratorPassword } from '@/lib/auth/change-password';
import { getCurrentUserContext } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { logSecurityAudit } from '@/lib/logging/security-audit';
import {
  changePasswordSchema,
  type ChangePasswordActionState,
} from '@/lib/types/auth.types';

const INVALID_PASSWORD_CHANGE_MESSAGE =
  'Revise la contraseña actual y los requisitos de la nueva contraseña.';

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/auth/signin' });
}

export async function changePasswordAction(
  _previousState: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const context = await getCurrentUserContext();

  if (context?.user.access !== 'GLOBAL_ADMIN') {
    return { error: 'No fue posible verificar la cuenta administradora.' };
  }

  const parsed = changePasswordSchema.safeParse({
    confirmation: formData.get('confirmation'),
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  });

  if (!parsed.success) {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'ADMINISTRATOR_PASSWORD',
      labId: context.lab.id,
      outcome: 'REJECTED',
      reason: 'INVALID_INPUT',
    });

    return { error: INVALID_PASSWORD_CHANGE_MESSAGE };
  }

  const result = await changeGlobalAdministratorPassword(prisma, {
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
    userId: context.user.id,
  });

  if (result === 'CURRENT_PASSWORD_INVALID') {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'ADMINISTRATOR_PASSWORD',
      labId: context.lab.id,
      outcome: 'REJECTED',
      reason: result,
    });

    return { error: 'La contraseña actual no es válida.' };
  }

  if (result === 'CONFLICT') {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'ADMINISTRATOR_PASSWORD',
      labId: context.lab.id,
      outcome: 'REJECTED',
      reason: result,
    });

    return {
      error:
        'La contraseña cambió en otra sesión. Actualice la página e intente nuevamente.',
    };
  }

  if (result === 'ACCOUNT_UNAVAILABLE') {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'ADMINISTRATOR_PASSWORD',
      labId: context.lab.id,
      outcome: 'FAILED',
      reason: result,
    });

    return { error: 'No fue posible verificar la cuenta administradora.' };
  }

  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'ADMINISTRATOR_PASSWORD',
    labId: context.lab.id,
    outcome: 'SUCCEEDED',
    reason: 'CHANGED',
  });

  await signOut({ redirectTo: '/auth/signin?passwordChanged=true' });

  return {};
}
