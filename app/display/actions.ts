'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { QR_DISPLAY_COOKIE_NAME } from '@/lib/const/qr';
import { redeemQrDisplayActivation } from '@/lib/db/qr-displays';
import { prisma } from '@/lib/db/prisma';
import { consumeRateLimit } from '@/lib/db/rate-limits';
import { parseServerEnvironment } from '@/lib/env';
import { logSecurityAudit } from '@/lib/logging/security-audit';
import {
  displayActivationCodeSchema,
  type RedeemDisplayActivationState,
} from '@/lib/types/qr.types';
import { getCurrentLab } from '@/lib/tenant/current-lab';

const INVALID_CODE_MESSAGE =
  'El código no es válido, ya fue utilizado o ha expirado.';

export async function redeemDisplayActivationAction(
  _previousState: RedeemDisplayActivationState,
  formData: FormData,
): Promise<RedeemDisplayActivationState> {
  const parsed = displayActivationCodeSchema.safeParse(formData.get('code'));

  if (!parsed.success) {
    return { error: INVALID_CODE_MESSAGE };
  }

  const lab = await getCurrentLab();
  const environment = parseServerEnvironment(process.env);
  const rateLimit = await consumeRateLimit(prisma, {
    action: 'DISPLAY_ACTIVATION',
    labId: lab.id,
    secret: environment.AUTH_SECRET,
  });

  if (rateLimit.status !== 'ALLOWED') {
    logSecurityAudit({
      event: 'DISPLAY_CAPABILITY',
      labId: lab.id,
      operation: 'REDEEM',
      outcome: rateLimit.status === 'LIMITED' ? 'REJECTED' : 'FAILED',
      reason:
        rateLimit.status === 'LIMITED'
          ? 'RATE_LIMITED'
          : 'DEPENDENCY_UNAVAILABLE',
    });

    return { error: INVALID_CODE_MESSAGE };
  }

  const result = await redeemQrDisplayActivation(prisma, {
    code: parsed.data,
    labId: lab.id,
    secret: environment.QR_SIGNING_SECRET,
  });

  if (!result.ok) {
    logSecurityAudit({
      event: 'DISPLAY_CAPABILITY',
      labId: lab.id,
      operation: 'REDEEM',
      outcome: 'REJECTED',
      reason: 'DOMAIN_REJECTED',
    });

    return { error: INVALID_CODE_MESSAGE };
  }

  logSecurityAudit({
    event: 'DISPLAY_CAPABILITY',
    labId: lab.id,
    operation: 'REDEEM',
    outcome: 'SUCCEEDED',
    reason: 'REDEEMED',
  });

  const cookieStore = await cookies();

  cookieStore.set(QR_DISPLAY_COOKIE_NAME, result.token, {
    expires: result.expiresAt,
    httpOnly: true,
    path: '/display',
    sameSite: 'strict',
    secure: new URL(environment.LAB_INSTANCE_PUBLIC_URL).protocol === 'https:',
  });

  redirect('/display');
}
