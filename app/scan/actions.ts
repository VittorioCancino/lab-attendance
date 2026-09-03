'use server';

import { cookies } from 'next/headers';

import { verifyPendingAttendanceScanToken } from '@/lib/auth/qr-tokens';
import { getCurrentUserContext } from '@/lib/auth/current-user';
import { PENDING_ATTENDANCE_SCAN_COOKIE_NAME } from '@/lib/const/qr';
import { recordAttendanceScan } from '@/lib/db/attendance-scans';
import { prisma } from '@/lib/db/prisma';
import { consumeRateLimit } from '@/lib/db/rate-limits';
import { parseServerEnvironment } from '@/lib/env';
import {
  confirmAttendanceScanSchema,
  type ConfirmAttendanceScanState,
} from '@/lib/types/attendance-scan.types';

const EXPIRED_SCAN_MESSAGE =
  'El código QR ya no está vigente. Escanee un código nuevo para continuar.';
const UNAVAILABLE_SCAN_MESSAGE =
  'No fue posible registrar la asistencia con esta cuenta.';
const CLOSED_SCAN_MESSAGE =
  'El laboratorio se encuentra fuera del horario de registro de entradas.';
const STATE_CHANGED_MESSAGE =
  'El estado de su asistencia cambió antes de confirmar. Escanee un código nuevo para revisar el registro actual.';
const RATE_LIMIT_MESSAGE =
  'Se realizaron demasiados intentos. Espere antes de escanear un código nuevo.';

export async function confirmAttendanceScanAction(
  _previousState: ConfirmAttendanceScanState,
  formData: FormData,
): Promise<ConfirmAttendanceScanState> {
  const environment = parseServerEnvironment(process.env);
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(
    PENDING_ATTENDANCE_SCAN_COOKIE_NAME,
  )?.value;
  const clearPendingScan = () => {
    cookieStore.set(PENDING_ATTENDANCE_SCAN_COOKIE_NAME, '', {
      expires: new Date(0),
      httpOnly: true,
      path: '/scan',
      sameSite: 'strict',
      secure:
        new URL(environment.LAB_INSTANCE_PUBLIC_URL).protocol === 'https:',
    });
  };

  if (pendingToken === undefined) {
    return { error: EXPIRED_SCAN_MESSAGE, status: 'ERROR' };
  }

  const expectedState = confirmAttendanceScanSchema.safeParse({
    expectedAction: formData.get('expectedAction'),
    expectedVisitId: formData.get('expectedVisitId'),
  });

  if (!expectedState.success) {
    clearPendingScan();
    return { error: UNAVAILABLE_SCAN_MESSAGE, status: 'ERROR' };
  }

  const context = await getCurrentUserContext();

  if (context?.user.access !== 'ATTENDEE') {
    clearPendingScan();
    return { error: UNAVAILABLE_SCAN_MESSAGE, status: 'ERROR' };
  }

  const rateLimit = await consumeRateLimit(prisma, {
    action: 'ATTENDANCE_CONFIRMATION',
    labId: context.lab.id,
    secret: environment.AUTH_SECRET,
    subject: context.user.id,
  });

  if (rateLimit.status !== 'ALLOWED') {
    clearPendingScan();
    return {
      error:
        rateLimit.status === 'LIMITED'
          ? RATE_LIMIT_MESSAGE
          : UNAVAILABLE_SCAN_MESSAGE,
      status: 'ERROR',
    };
  }

  const claims = verifyPendingAttendanceScanToken(
    environment.QR_SIGNING_SECRET,
    context.lab.id,
    pendingToken,
  );

  if (claims === null) {
    clearPendingScan();
    return { error: EXPIRED_SCAN_MESSAGE, status: 'ERROR' };
  }

  const result = await recordAttendanceScan(prisma, {
    expectedAction: expectedState.data.expectedAction,
    expectedVisitId: expectedState.data.expectedVisitId,
    labId: context.lab.id,
    qrWindow: claims.window,
    userId: context.user.id,
  });

  if (!result.ok) {
    clearPendingScan();
    const error =
      result.reason === 'CHECK_IN_CLOSED'
        ? CLOSED_SCAN_MESSAGE
        : result.reason === 'STATE_CHANGED'
          ? STATE_CHANGED_MESSAGE
          : UNAVAILABLE_SCAN_MESSAGE;

    return { error, status: 'ERROR' };
  }

  return {
    action: result.action,
    duplicate: result.duplicate,
    occurredAt: result.occurredAt.toISOString(),
    status: 'SUCCESS',
  };
}
