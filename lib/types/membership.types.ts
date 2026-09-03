import { z } from 'zod';

export const membershipRoleSchema = z.enum(['ATTENDEE', 'MANAGER']);

export const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .transform((email) => email.toLowerCase()),
  name: z.string().trim().min(2).max(160),
  role: membershipRoleSchema,
});

export const invitationTokenSchema = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]+$/);

export const acceptInvitationSchema = z
  .object({
    confirmation: z.string().min(12).max(1024),
    password: z.string().min(12).max(1024),
    token: invitationTokenSchema,
  })
  .refine((values) => values.password === values.confirmation, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmation'],
  });

export const membershipStatusSchema = z.object({
  active: z.enum(['true', 'false']).transform((value) => value === 'true'),
  role: membershipRoleSchema,
  userId: z.uuid(),
});

export const revokeInvitationSchema = z.object({
  invitationId: z.uuid(),
  role: membershipRoleSchema,
});

export const managementNoticeSchema = z.enum([
  'invitation-revoked',
  'membership-updated',
  'state-changed',
]);

export type ManagementNotice = z.infer<typeof managementNoticeSchema>;

export interface InvitationActionState {
  error?: string;
  invitationPath?: string;
  success?: string;
  values?: {
    email: string;
    name: string;
  };
}

export type CreateInvitationFormAction = (
  previousState: InvitationActionState,
  formData: FormData,
) => Promise<InvitationActionState>;

export type AccessMutationFormAction = (formData: FormData) => Promise<void>;

export interface InvitationAcceptanceState {
  error?: string;
}
