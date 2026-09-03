'use server';

import { cookies } from 'next/headers';
import { AuthError, CredentialsSignin } from 'next-auth';

import { verifyPendingAttendanceScanToken } from '@/lib/auth/qr-tokens';
import { signIn } from '@/lib/auth/auth';
import { PENDING_ATTENDANCE_SCAN_COOKIE_NAME } from '@/lib/const/qr';
import { parseServerEnvironment } from '@/lib/env';
import {
  loginSchema,
  LOGIN_SURFACE_DENIED_CODE,
  type LoginActionState,
} from '@/lib/types/auth.types';
import { getCurrentLab } from '@/lib/tenant/current-lab';

const INVALID_CREDENTIALS_MESSAGE =
  'Las credenciales ingresadas no son válidas.';
const ACCESS_DENIED_MESSAGE =
  'Esta cuenta no está habilitada para registrar asistencia.';
const EXPIRED_SCAN_MESSAGE =
  'El código QR ya no está vigente. Escanee un código nuevo para continuar.';

export async function attendanceLoginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const lab = await getCurrentLab();
  const environment = parseServerEnvironment(process.env);
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(
    PENDING_ATTENDANCE_SCAN_COOKIE_NAME,
  )?.value;

  if (
    pendingToken === undefined ||
    verifyPendingAttendanceScanToken(
      environment.QR_SIGNING_SECRET,
      lab.id,
      pendingToken,
    ) === null
  ) {
    return { error: EXPIRED_SCAN_MESSAGE };
  }

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
      redirectTo: '/scan',
      surface: 'ATTENDANCE',
    });
  } catch (error: unknown) {
    if (
      error instanceof CredentialsSignin &&
      error.code === LOGIN_SURFACE_DENIED_CODE
    ) {
      return { error: ACCESS_DENIED_MESSAGE };
    }

    if (error instanceof AuthError) {
      return { error: INVALID_CREDENTIALS_MESSAGE };
    }

    throw error;
  }

  return {};
}
