import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PENDING_ATTENDANCE_SCAN_COOKIE_NAME } from '@/lib/const/qr';

const mocks = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  createPendingAttendanceScanToken: vi.fn(),
  getCurrentLab: vi.fn(),
  parseServerEnvironment: vi.fn(),
  verifyRotatingQrToken: vi.fn(),
}));

vi.mock('@/lib/auth/qr-tokens', () => ({
  createPendingAttendanceScanToken: mocks.createPendingAttendanceScanToken,
  verifyRotatingQrToken: mocks.verifyRotatingQrToken,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/db/rate-limits', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));
vi.mock('@/lib/env', () => ({
  parseServerEnvironment: mocks.parseServerEnvironment,
}));
vi.mock('@/lib/tenant/current-lab', () => ({
  getCurrentLab: mocks.getCurrentLab,
}));

import { POST } from '@/app/api/attendance/scan/exchange/route';

const lab = { id: 'trusted-lab-id', name: 'Laboratorio de prueba' };
const environment = {
  AUTH_SECRET: 'auth-secret-for-tests',
  LAB_INSTANCE_PUBLIC_URL: 'https://lab.example.test',
  QR_SIGNING_SECRET: 'qr-secret-for-tests',
};

beforeEach(() => {
  mocks.consumeRateLimit.mockReset();
  mocks.createPendingAttendanceScanToken.mockReset();
  mocks.getCurrentLab.mockReset();
  mocks.parseServerEnvironment.mockReset();
  mocks.verifyRotatingQrToken.mockReset();

  mocks.getCurrentLab.mockResolvedValue(lab);
  mocks.parseServerEnvironment.mockReturnValue(environment);
});

function createRequest(body: unknown): Request {
  return new Request('https://lab.example.test/api/attendance/scan/exchange', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

describe('attendance QR exchange route', () => {
  it('returns a generic 429 response with Retry-After at the tenant limit', async () => {
    mocks.consumeRateLimit.mockResolvedValue({
      retryAfterSeconds: 37,
      status: 'LIMITED',
    });

    const response = await POST(createRequest({ token: 'qr-token' }));

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('retry-after')).toBe('37');
    await expect(response.json()).resolves.toEqual({
      error: 'El código QR no es válido o ha expirado.',
      ok: false,
    });
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      {},
      {
        action: 'QR_EXCHANGE',
        labId: lab.id,
        secret: environment.AUTH_SECRET,
      },
    );
    expect(mocks.verifyRotatingQrToken).not.toHaveBeenCalled();
  });

  it('fails closed without Retry-After when the limiter is unavailable', async () => {
    mocks.consumeRateLimit.mockResolvedValue({ status: 'UNAVAILABLE' });

    const response = await POST(createRequest({ token: 'qr-token' }));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: 'El código QR no es válido o ha expirado.',
      ok: false,
    });
    expect(mocks.verifyRotatingQrToken).not.toHaveBeenCalled();
  });

  it('sets a scoped pending credential after rate-limit and QR validation', async () => {
    const expiresAt = new Date('2026-09-03T15:05:00.000Z');

    mocks.consumeRateLimit.mockResolvedValue({ status: 'ALLOWED' });
    mocks.verifyRotatingQrToken.mockReturnValue({ window: 123 });
    mocks.createPendingAttendanceScanToken.mockReturnValue({
      expiresAt,
      token: 'pending-scan-token',
    });

    const response = await POST(createRequest({ token: 'qr-token' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.verifyRotatingQrToken).toHaveBeenCalledWith(
      environment.QR_SIGNING_SECRET,
      lab.id,
      'qr-token',
      expect.any(Date),
    );
    expect(mocks.createPendingAttendanceScanToken).toHaveBeenCalledWith(
      environment.QR_SIGNING_SECRET,
      lab.id,
      123,
      expect.any(Date),
    );
    expect(
      response.cookies.get(PENDING_ATTENDANCE_SCAN_COOKIE_NAME),
    ).toMatchObject({
      expires: expiresAt,
      httpOnly: true,
      path: '/scan',
      sameSite: 'strict',
      value: 'pending-scan-token',
    });
  });
});
