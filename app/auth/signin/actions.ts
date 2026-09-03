'use server';

import { AuthError, CredentialsSignin } from 'next-auth';

import { signIn } from '@/lib/auth/auth';
import {
  loginSchema,
  LOGIN_SURFACE_DENIED_CODE,
  type LoginActionState,
} from '@/lib/types/auth.types';

const INVALID_CREDENTIALS_MESSAGE =
  'Las credenciales ingresadas no son válidas.';
const STAFF_ACCESS_DENIED_MESSAGE =
  'Esta cuenta no está autorizada para iniciar sesión desde este panel.';

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/',
      surface: 'STAFF',
    });
  } catch (error: unknown) {
    if (
      error instanceof CredentialsSignin &&
      error.code === LOGIN_SURFACE_DENIED_CODE
    ) {
      return { error: STAFF_ACCESS_DENIED_MESSAGE };
    }

    if (error instanceof AuthError) {
      return { error: INVALID_CREDENTIALS_MESSAGE };
    }

    throw error;
  }

  return {};
}
