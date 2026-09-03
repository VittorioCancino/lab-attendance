import { z } from 'zod';

import { DISPLAY_ACTIVATION_CODE_LENGTH } from '@/lib/const/qr';
import { normalizeDisplayActivationCode } from '@/lib/util/qr-code';

export const displayLabelSchema = z.string().trim().min(2).max(80);

export const displayActivationCodeSchema = z
  .string()
  .max(32)
  .transform(normalizeDisplayActivationCode)
  .pipe(
    z
      .string()
      .length(DISPLAY_ACTIVATION_CODE_LENGTH)
      .regex(/^[0-9A-HJKMNP-TV-Z]+$/),
  );

export const revokeDisplaySchema = z.object({
  activationId: z.uuid(),
});

export interface CreateDisplayActivationState {
  code?: string;
  error?: string;
  expiresAt?: string;
  label?: string;
  success?: string;
}

export interface RedeemDisplayActivationState {
  error?: string;
}
