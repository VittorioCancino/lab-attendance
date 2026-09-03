'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireLabManager } from '@/lib/auth/require-lab-manager';
import {
  createQrDisplayActivation,
  revokeQrDisplay,
} from '@/lib/db/qr-displays';
import { prisma } from '@/lib/db/prisma';
import { parseServerEnvironment } from '@/lib/env';
import { logSecurityAudit } from '@/lib/logging/security-audit';
import {
  displayLabelSchema,
  revokeDisplaySchema,
  type CreateDisplayActivationState,
} from '@/lib/types/qr.types';

const DISPLAY_MANAGER_PATH = '/manager/displays';

export async function createDisplayActivationAction(
  _previousState: CreateDisplayActivationState,
  formData: FormData,
): Promise<CreateDisplayActivationState> {
  const context = await requireLabManager();
  const environment = parseServerEnvironment(process.env);
  const submittedLabel = formData.get('label');
  const label = typeof submittedLabel === 'string' ? submittedLabel : '';
  const parsed = displayLabelSchema.safeParse(label);

  if (!parsed.success) {
    return {
      error: 'Ingrese un nombre de pantalla válido.',
      label,
    };
  }

  const result = await createQrDisplayActivation(prisma, {
    createdByUserId: context.user.id,
    labId: context.lab.id,
    label: parsed.data,
    secret: environment.QR_SIGNING_SECRET,
  });

  if (!result.ok) {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'DISPLAY_CAPABILITY',
      labId: context.lab.id,
      operation: 'CREATE',
      outcome: 'REJECTED',
      reason: 'DOMAIN_REJECTED',
    });

    return {
      error: 'No fue posible autorizar la nueva pantalla.',
      label,
    };
  }

  revalidatePath(DISPLAY_MANAGER_PATH);
  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'DISPLAY_CAPABILITY',
    labId: context.lab.id,
    operation: 'CREATE',
    outcome: 'SUCCEEDED',
    reason: 'CREATED',
  });

  return {
    code: result.code,
    expiresAt: result.expiresAt.toISOString(),
    success:
      'Código creado. Ingréselo en la pantalla pública antes de que expire.',
  };
}

export async function revokeDisplayAction(formData: FormData): Promise<void> {
  const context = await requireLabManager();
  const parsed = revokeDisplaySchema.safeParse({
    activationId: formData.get('activationId'),
  });

  if (!parsed.success) {
    return;
  }

  const result = await revokeQrDisplay(prisma, {
    activationId: parsed.data.activationId,
    labId: context.lab.id,
    managerUserId: context.user.id,
  });

  logSecurityAudit({
    activationId: parsed.data.activationId,
    actorUserId: context.user.id,
    event: 'DISPLAY_CAPABILITY',
    labId: context.lab.id,
    operation: 'REVOKE',
    outcome: result === 'REVOKED' ? 'SUCCEEDED' : 'REJECTED',
    reason: result === 'REVOKED' ? 'REVOKED' : 'STATE_CHANGED',
  });

  revalidatePath(DISPLAY_MANAGER_PATH);
  redirect(
    `${DISPLAY_MANAGER_PATH}?notice=${result === 'REVOKED' ? 'revoked' : 'state-changed'}`,
  );
}
