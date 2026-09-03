import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email())
    .transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(1024),
});

export const loginSurfaceSchema = z.enum(['ATTENDANCE', 'STAFF']);
export const authLoginSchema = loginSchema.extend({
  surface: loginSurfaceSchema,
});

export const LOGIN_SURFACE_DENIED_CODE = 'login_surface_denied';

export type LoginSurface = z.infer<typeof loginSurfaceSchema>;

export const changePasswordSchema = z
  .object({
    confirmation: z.string().min(12).max(1024),
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(12).max(1024),
  })
  .superRefine((passwords, context) => {
    if (passwords.newPassword !== passwords.confirmation) {
      context.addIssue({
        code: 'custom',
        message: 'Passwords do not match.',
        path: ['confirmation'],
      });
    }

    if (passwords.newPassword === passwords.currentPassword) {
      context.addIssue({
        code: 'custom',
        message: 'New password must be different.',
        path: ['newPassword'],
      });
    }
  });

export interface ChangePasswordActionState {
  error?: string;
}

export interface LoginActionState {
  error?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
