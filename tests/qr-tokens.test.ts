import { describe, expect, it } from 'vitest';

import {
  createPendingAttendanceScanToken,
  createRotatingQrToken,
  generateDisplayActivationCode,
  generateDisplaySessionToken,
  hashDisplayActivationCode,
  hashDisplaySessionToken,
  verifyPendingAttendanceScanToken,
  verifyRotatingQrToken,
} from '@/lib/auth/qr-tokens';
import {
  DISPLAY_ACTIVATION_CODE_LENGTH,
  PENDING_ATTENDANCE_SCAN_LIFETIME_MS,
  QR_PREVIOUS_WINDOW_GRACE_MS,
  QR_ROTATION_MS,
} from '@/lib/const/qr';
import { displayActivationCodeSchema } from '@/lib/types/qr.types';

const secret = 'qr-signing-secret-for-unit-tests'.repeat(2);
const labId = '11111111-1111-4111-8111-111111111111';

describe('display credentials', () => {
  it('generates Crockford Base32 activation codes and opaque session tokens', () => {
    const activationCodes = Array.from({ length: 20 }, () =>
      generateDisplayActivationCode(),
    );
    const sessionToken = generateDisplaySessionToken();

    expect(new Set(activationCodes).size).toBe(activationCodes.length);
    for (const code of activationCodes) {
      expect(code).toHaveLength(DISPLAY_ACTIVATION_CODE_LENGTH);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    }
    expect(sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('normalizes activation codes while binding credential hashes to a lab', () => {
    const code = '01AB-CDEF-GHJK-MNPQ';

    expect(displayActivationCodeSchema.parse(` ${code.toLowerCase()} `)).toBe(
      '01ABCDEFGHJKMNPQ',
    );
    expect(hashDisplayActivationCode(secret, labId, code)).toBe(
      hashDisplayActivationCode(secret, labId, '01abcdefghjkmnpq'),
    );
    expect(
      hashDisplayActivationCode(
        secret,
        '22222222-2222-4222-8222-222222222222',
        code,
      ),
    ).not.toBe(hashDisplayActivationCode(secret, labId, code));
    expect(hashDisplaySessionToken(secret, labId, 'opaque-token')).not.toBe(
      hashDisplaySessionToken(
        secret,
        '22222222-2222-4222-8222-222222222222',
        'opaque-token',
      ),
    );
  });
});

describe('pending attendance scan tokens', () => {
  const issuedAt = new Date('2026-08-28T12:00:00.000Z');

  it('extends a verified QR window for exactly five minutes', () => {
    const expectedExpiresAt = new Date(issuedAt.getTime() + 300_000);
    const pending = createPendingAttendanceScanToken(
      secret,
      labId,
      123_456,
      issuedAt,
    );

    expect(PENDING_ATTENDANCE_SCAN_LIFETIME_MS).toBe(300_000);
    expect(pending.expiresAt).toEqual(expectedExpiresAt);
    expect(
      verifyPendingAttendanceScanToken(
        secret,
        labId,
        pending.token,
        new Date(expectedExpiresAt.getTime() - 1),
      ),
    ).toMatchObject({
      expiresAt: expectedExpiresAt.getTime(),
      issuedAt: issuedAt.getTime(),
      labId,
      window: 123_456,
    });
    expect(
      verifyPendingAttendanceScanToken(
        secret,
        labId,
        pending.token,
        expectedExpiresAt,
      ),
    ).toBeNull();
  });

  it('rejects early, cross-lab, tampered, and incorrectly signed use', () => {
    const pending = createPendingAttendanceScanToken(
      secret,
      labId,
      123_456,
      issuedAt,
    );
    const finalCharacter = pending.token.at(-1);
    const tamperedToken = `${pending.token.slice(0, -1)}${finalCharacter === 'A' ? 'B' : 'A'}`;

    expect(
      verifyPendingAttendanceScanToken(
        secret,
        labId,
        pending.token,
        new Date(issuedAt.getTime() - 1),
      ),
    ).toBeNull();
    expect(
      verifyPendingAttendanceScanToken(
        secret,
        '22222222-2222-4222-8222-222222222222',
        pending.token,
        issuedAt,
      ),
    ).toBeNull();
    expect(
      verifyPendingAttendanceScanToken(secret, labId, tamperedToken, issuedAt),
    ).toBeNull();
    expect(
      verifyPendingAttendanceScanToken(
        'different-secret'.repeat(3),
        labId,
        pending.token,
        issuedAt,
      ),
    ).toBeNull();
  });
});

describe('rotating QR tokens', () => {
  const window = 25_000_000;
  const windowStart = window * QR_ROTATION_MS;

  it('creates one canonical token per lab and rotation window', () => {
    expect(QR_ROTATION_MS).toBe(60_000);

    const first = createRotatingQrToken(
      secret,
      labId,
      new Date(windowStart + 1_000),
    );
    const second = createRotatingQrToken(
      secret,
      labId,
      new Date(windowStart + QR_ROTATION_MS - 1),
    );

    expect(first).toEqual(second);
    expect(first.window).toBe(window);
    expect(first.refreshAt).toEqual(new Date(windowStart + QR_ROTATION_MS));
    expect(
      createRotatingQrToken(
        secret,
        '22222222-2222-4222-8222-222222222222',
        new Date(windowStart + 1_000),
      ).token,
    ).not.toBe(first.token);
  });

  it('accepts only the current window and the explicit previous-window grace', () => {
    const token = createRotatingQrToken(
      secret,
      labId,
      new Date(windowStart + 30_000),
    ).token;
    const nextWindowStart = windowStart + QR_ROTATION_MS;

    expect(
      verifyRotatingQrToken(
        secret,
        labId,
        token,
        new Date(windowStart + 59_999),
      ),
    ).toMatchObject({ labId, window });
    expect(
      verifyRotatingQrToken(
        secret,
        labId,
        token,
        new Date(nextWindowStart + QR_PREVIOUS_WINDOW_GRACE_MS - 1),
      ),
    ).toMatchObject({ labId, window });
    expect(
      verifyRotatingQrToken(
        secret,
        labId,
        token,
        new Date(nextWindowStart + QR_PREVIOUS_WINDOW_GRACE_MS),
      ),
    ).toBeNull();
    expect(
      verifyRotatingQrToken(secret, labId, token, new Date(windowStart - 1)),
    ).toBeNull();
  });

  it('rejects tampered, malformed, cross-lab, and incorrectly signed tokens', () => {
    const token = createRotatingQrToken(
      secret,
      labId,
      new Date(windowStart + 30_000),
    ).token;
    const finalCharacter = token.at(-1);
    const tamperedToken = `${token.slice(0, -1)}${finalCharacter === 'A' ? 'B' : 'A'}`;
    const now = new Date(windowStart + 30_000);

    expect(verifyRotatingQrToken(secret, labId, tamperedToken, now)).toBeNull();
    expect(verifyRotatingQrToken(secret, labId, 'malformed', now)).toBeNull();
    expect(
      verifyRotatingQrToken(
        secret,
        '22222222-2222-4222-8222-222222222222',
        token,
        now,
      ),
    ).toBeNull();
    expect(
      verifyRotatingQrToken('different-secret'.repeat(3), labId, token, now),
    ).toBeNull();
  });
});
