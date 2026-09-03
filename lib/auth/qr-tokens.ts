import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  DISPLAY_ACTIVATION_CODE_LENGTH,
  PENDING_ATTENDANCE_SCAN_LIFETIME_MS,
  QR_PREVIOUS_WINDOW_GRACE_MS,
  QR_ROTATION_MS,
} from '@/lib/const/qr';
import { normalizeDisplayActivationCode } from '@/lib/util/qr-code';

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

interface QrClaims {
  labId: string;
  purpose: 'attendance';
  version: 1;
  window: number;
}

export interface PendingAttendanceScanClaims {
  expiresAt: number;
  issuedAt: number;
  labId: string;
  purpose: 'pending-attendance';
  version: 1;
  window: number;
}

export interface PendingAttendanceScanToken {
  expiresAt: Date;
  token: string;
}

export interface RotatingQrToken {
  refreshAt: Date;
  token: string;
  window: number;
}

function signValue(
  secret: string,
  purpose: string,
  value: string,
  encoding: 'base64url' | 'hex',
): string {
  return createHmac('sha256', secret)
    .update(`lab-attendance:${purpose}:v1\0${value}`)
    .digest(encoding);
}

function hasValidSignature(
  secret: string,
  purpose: string,
  value: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signValue(secret, purpose, value, 'base64url'));
  const received = Buffer.from(signature);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function generateDisplayActivationCode(): string {
  let value = BigInt(`0x${randomBytes(10).toString('hex')}`);
  let code = '';

  for (let index = 0; index < DISPLAY_ACTIVATION_CODE_LENGTH; index += 1) {
    const character = CROCKFORD_BASE32.at(Number(value & 31n));

    if (character === undefined) {
      throw new Error('Could not encode display activation code.');
    }

    code = character + code;
    value >>= 5n;
  }

  return code;
}

export function hashDisplayActivationCode(
  secret: string,
  labId: string,
  code: string,
): string {
  return signValue(
    secret,
    'display-activation',
    `${labId}\0${normalizeDisplayActivationCode(code)}`,
    'hex',
  );
}

export function generateDisplaySessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDisplaySessionToken(
  secret: string,
  labId: string,
  token: string,
): string {
  return signValue(secret, 'display-session', `${labId}\0${token}`, 'hex');
}

export function createPendingAttendanceScanToken(
  secret: string,
  labId: string,
  window: number,
  now = new Date(),
): PendingAttendanceScanToken {
  const issuedAt = now.getTime();
  const expiresAt = issuedAt + PENDING_ATTENDANCE_SCAN_LIFETIME_MS;
  const claims: PendingAttendanceScanClaims = {
    expiresAt,
    issuedAt,
    labId,
    purpose: 'pending-attendance',
    version: 1,
    window,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = signValue(
    secret,
    'pending-attendance-scan',
    payload,
    'base64url',
  );

  return {
    expiresAt: new Date(expiresAt),
    token: `${payload}.${signature}`,
  };
}

export function verifyPendingAttendanceScanToken(
  secret: string,
  expectedLabId: string,
  token: string,
  now = new Date(),
): PendingAttendanceScanClaims | null {
  const parts = token.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts as [string, string];

  if (
    !hasValidSignature(secret, 'pending-attendance-scan', payload, signature)
  ) {
    return null;
  }

  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );

    if (
      typeof claims !== 'object' ||
      claims === null ||
      !('expiresAt' in claims) ||
      !('issuedAt' in claims) ||
      !('labId' in claims) ||
      !('purpose' in claims) ||
      !('version' in claims) ||
      !('window' in claims) ||
      claims.labId !== expectedLabId ||
      claims.purpose !== 'pending-attendance' ||
      claims.version !== 1 ||
      typeof claims.expiresAt !== 'number' ||
      !Number.isSafeInteger(claims.expiresAt) ||
      typeof claims.issuedAt !== 'number' ||
      !Number.isSafeInteger(claims.issuedAt) ||
      typeof claims.window !== 'number' ||
      !Number.isSafeInteger(claims.window) ||
      claims.window < 0 ||
      claims.issuedAt > now.getTime() ||
      claims.expiresAt <= now.getTime() ||
      claims.expiresAt <= claims.issuedAt ||
      claims.expiresAt - claims.issuedAt > PENDING_ATTENDANCE_SCAN_LIFETIME_MS
    ) {
      return null;
    }

    return claims as PendingAttendanceScanClaims;
  } catch {
    return null;
  }
}

export function createRotatingQrToken(
  secret: string,
  labId: string,
  now = new Date(),
): RotatingQrToken {
  const window = Math.floor(now.getTime() / QR_ROTATION_MS);
  const claims: QrClaims = {
    labId,
    purpose: 'attendance',
    version: 1,
    window,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = signValue(secret, 'attendance-qr', payload, 'base64url');

  return {
    refreshAt: new Date((window + 1) * QR_ROTATION_MS),
    token: `${payload}.${signature}`,
    window,
  };
}

export function verifyRotatingQrToken(
  secret: string,
  expectedLabId: string,
  token: string,
  now = new Date(),
): QrClaims | null {
  const parts = token.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts as [string, string];

  if (!hasValidSignature(secret, 'attendance-qr', payload, signature)) {
    return null;
  }

  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );

    if (
      typeof claims !== 'object' ||
      claims === null ||
      !('labId' in claims) ||
      !('purpose' in claims) ||
      !('version' in claims) ||
      !('window' in claims) ||
      claims.labId !== expectedLabId ||
      claims.purpose !== 'attendance' ||
      claims.version !== 1 ||
      typeof claims.window !== 'number' ||
      !Number.isSafeInteger(claims.window)
    ) {
      return null;
    }

    const currentWindow = Math.floor(now.getTime() / QR_ROTATION_MS);
    const elapsedInWindow = now.getTime() % QR_ROTATION_MS;
    const windowIsValid =
      claims.window === currentWindow ||
      (claims.window === currentWindow - 1 &&
        elapsedInWindow < QR_PREVIOUS_WINDOW_GRACE_MS);

    return windowIsValid ? (claims as QrClaims) : null;
  } catch {
    return null;
  }
}
