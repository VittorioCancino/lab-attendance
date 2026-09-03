import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PENDING_ATTENDANCE_SCAN_COOKIE_NAME } from '@/lib/const/qr';

const mocks = vi.hoisted(() => ({
  acceptLabInvitation: vi.fn(),
  consumeRateLimit: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  getCurrentLab: vi.fn(),
  getCurrentUserContext: vi.fn(),
  logSecurityAudit: vi.fn(),
  parseServerEnvironment: vi.fn(),
  recordAttendanceScan: vi.fn(),
  redirect: vi.fn(),
  redeemQrDisplayActivation: vi.fn(),
  signOut: vi.fn(),
  verifyPendingAttendanceScanToken: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/auth', () => ({ signOut: mocks.signOut }));
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));
vi.mock('@/lib/auth/qr-tokens', () => ({
  verifyPendingAttendanceScanToken: mocks.verifyPendingAttendanceScanToken,
}));
vi.mock('@/lib/db/attendance-scans', () => ({
  recordAttendanceScan: mocks.recordAttendanceScan,
}));
vi.mock('@/lib/db/invitations', () => ({
  acceptLabInvitation: mocks.acceptLabInvitation,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/db/qr-displays', () => ({
  redeemQrDisplayActivation: mocks.redeemQrDisplayActivation,
}));
vi.mock('@/lib/db/rate-limits', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));
vi.mock('@/lib/env', () => ({
  parseServerEnvironment: mocks.parseServerEnvironment,
}));
vi.mock('@/lib/logging/security-audit', () => ({
  logSecurityAudit: mocks.logSecurityAudit,
}));
vi.mock('@/lib/tenant/current-lab', () => ({
  getCurrentLab: mocks.getCurrentLab,
}));

import { redeemDisplayActivationAction } from '@/app/display/actions';
import { acceptInvitationAction } from '@/app/invite/actions';
import { confirmAttendanceScanAction } from '@/app/scan/actions';

const environment = {
  AUTH_SECRET: 'auth-secret-for-tests',
  LAB_INSTANCE_PUBLIC_URL: 'https://lab.example.test',
  QR_SIGNING_SECRET: 'qr-signing-secret-for-tests',
};
const lab = { id: 'trusted-lab-id' };

beforeEach(() => {
  for (const mock of [
    mocks.acceptLabInvitation,
    mocks.consumeRateLimit,
    mocks.cookieGet,
    mocks.cookieSet,
    mocks.cookies,
    mocks.getCurrentLab,
    mocks.getCurrentUserContext,
    mocks.logSecurityAudit,
    mocks.parseServerEnvironment,
    mocks.recordAttendanceScan,
    mocks.redirect,
    mocks.redeemQrDisplayActivation,
    mocks.signOut,
    mocks.verifyPendingAttendanceScanToken,
  ]) {
    mock.mockReset();
  }

  mocks.cookies.mockResolvedValue({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
  });
  mocks.getCurrentLab.mockResolvedValue(lab);
  mocks.parseServerEnvironment.mockReturnValue(environment);
});

describe('sensitive mutation rate limits', () => {
  it('rejects invitation acceptance generically before credential work', async () => {
    const token = 'a'.repeat(43);
    const formData = new FormData();

    formData.set('confirmation', 'valid-password');
    formData.set('password', 'valid-password');
    formData.set('token', token);
    mocks.consumeRateLimit.mockResolvedValue({ status: 'LIMITED' });

    await expect(acceptInvitationAction({}, formData)).resolves.toEqual({
      error:
        'No fue posible aceptar la invitación. Revise el enlace y la contraseña ingresada.',
    });
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      {},
      {
        action: 'INVITATION_ACCEPTANCE',
        labId: lab.id,
        secret: environment.AUTH_SECRET,
        subject: token,
      },
    );
    expect(mocks.acceptLabInvitation).not.toHaveBeenCalled();
    expect(mocks.logSecurityAudit).toHaveBeenCalledWith({
      event: 'INVITATION',
      labId: lab.id,
      operation: 'ACCEPT',
      outcome: 'REJECTED',
      reason: 'RATE_LIMITED',
    });
  });

  it('rejects display activation generically before code redemption', async () => {
    const formData = new FormData();

    formData.set('code', 'ABCD-EFGH-JKLM-NPQR');
    mocks.consumeRateLimit.mockResolvedValue({ status: 'UNAVAILABLE' });

    await expect(redeemDisplayActivationAction({}, formData)).resolves.toEqual({
      error: 'El código no es válido, ya fue utilizado o ha expirado.',
    });
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      {},
      {
        action: 'DISPLAY_ACTIVATION',
        labId: lab.id,
        secret: environment.AUTH_SECRET,
      },
    );
    expect(mocks.redeemQrDisplayActivation).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('limits attendance by authenticated user before token verification', async () => {
    const formData = new FormData();

    formData.set('expectedAction', 'CHECK_IN');
    formData.set('expectedVisitId', '');
    mocks.cookieGet.mockReturnValue({ value: 'pending-scan-token' });
    mocks.getCurrentUserContext.mockResolvedValue({
      lab,
      user: { access: 'ATTENDEE', id: 'attendee-id' },
    });
    mocks.consumeRateLimit.mockResolvedValue({ status: 'LIMITED' });

    await expect(
      confirmAttendanceScanAction({ status: 'IDLE' }, formData),
    ).resolves.toEqual({
      error:
        'Se realizaron demasiados intentos. Espere antes de escanear un código nuevo.',
      status: 'ERROR',
    });
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      {},
      {
        action: 'ATTENDANCE_CONFIRMATION',
        labId: lab.id,
        secret: environment.AUTH_SECRET,
        subject: 'attendee-id',
      },
    );
    expect(mocks.verifyPendingAttendanceScanToken).not.toHaveBeenCalled();
    expect(mocks.recordAttendanceScan).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      PENDING_ATTENDANCE_SCAN_COOKIE_NAME,
      '',
      expect.objectContaining({ path: '/scan' }),
    );
  });
});
