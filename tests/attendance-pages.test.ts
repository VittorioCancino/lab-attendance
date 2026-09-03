import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestElementProps {
  [key: string]: unknown;
  children?: ReactNode;
}

const mocks = vi.hoisted(() => ({
  AttendanceScanConfirmation: () => null,
  QRCodeSVG: () => null,
  ScanQrExchange: () => null,
  attendeeLogoutAction: vi.fn(),
  cookies: vi.fn(),
  createRotatingQrToken: vi.fn(),
  getAttendanceScanPreview: vi.fn(),
  getCurrentLab: vi.fn(),
  getCurrentUserContext: vi.fn(),
  getValidQrDisplaySession: vi.fn(),
  parseServerEnvironment: vi.fn(),
  reconcileLabAttendance: vi.fn(),
  redirect: vi.fn(),
  switchAttendanceAccountAction: vi.fn(),
  verifyPendingAttendanceScanToken: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('qrcode.react', () => ({ QRCodeSVG: mocks.QRCodeSVG }));
vi.mock('@/app/attendance/actions', () => ({
  attendeeLogoutAction: mocks.attendeeLogoutAction,
  switchAttendanceAccountAction: mocks.switchAttendanceAccountAction,
}));
vi.mock('@/components/attendance/AttendanceScanConfirmation', () => ({
  AttendanceScanConfirmation: mocks.AttendanceScanConfirmation,
}));
vi.mock('@/components/attendance/ScanQrExchange', () => ({
  ScanQrExchange: mocks.ScanQrExchange,
}));
vi.mock('@/components/display/DisplayActivationForm', () => ({
  DisplayActivationForm: function DisplayActivationFormStub() {
    return null;
  },
}));
vi.mock('@/components/display/QrDisplayRefresh', () => ({
  QrDisplayRefresh: function QrDisplayRefreshStub() {
    return null;
  },
}));
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));
vi.mock('@/lib/auth/qr-tokens', () => ({
  createRotatingQrToken: mocks.createRotatingQrToken,
  verifyPendingAttendanceScanToken: mocks.verifyPendingAttendanceScanToken,
}));
vi.mock('@/lib/db/attendance-policy', () => ({
  reconcileLabAttendance: mocks.reconcileLabAttendance,
}));
vi.mock('@/lib/db/attendance-scans', () => ({
  getAttendanceScanPreview: mocks.getAttendanceScanPreview,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/db/qr-displays', () => ({
  getValidQrDisplaySession: mocks.getValidQrDisplaySession,
}));
vi.mock('@/lib/env', () => ({
  parseServerEnvironment: mocks.parseServerEnvironment,
}));
vi.mock('@/lib/tenant/current-lab', () => ({
  getCurrentLab: mocks.getCurrentLab,
}));

import AttendancePage from '@/app/attendance/page';
import PublicDisplayPage from '@/app/display/page';
import ScanPage from '@/app/scan/page';

const lab = {
  attendanceClosesAtMinute: 1080,
  attendanceOpensAtMinute: 420,
  id: 'trusted-lab-id',
  name: 'Laboratorio de prueba',
  timezone: 'America/Santiago',
};

function asElement(node: ReactNode): ReactElement<TestElementProps> {
  if (!isValidElement<TestElementProps>(node)) {
    throw new Error('Expected a React element.');
  }

  return node;
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<TestElementProps>) => boolean,
): ReactElement<TestElementProps> | null {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const match = findElement(child, predicate);

      if (match !== null) {
        return match;
      }
    }

    return null;
  }

  if (!isValidElement<TestElementProps>(node)) {
    return null;
  }

  if (predicate(node)) {
    return node;
  }

  return findElement(node.props.children, predicate);
}

function collectText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return (node as ReactNode[]).map(collectText).join(' ');
  }

  if (!isValidElement<TestElementProps>(node)) {
    return '';
  }

  return collectText(node.props.children);
}

beforeEach(() => {
  for (const mock of [
    mocks.cookies,
    mocks.createRotatingQrToken,
    mocks.getAttendanceScanPreview,
    mocks.getCurrentLab,
    mocks.getCurrentUserContext,
    mocks.getValidQrDisplaySession,
    mocks.parseServerEnvironment,
    mocks.reconcileLabAttendance,
    mocks.redirect,
    mocks.verifyPendingAttendanceScanToken,
  ]) {
    mock.mockReset();
  }

  mocks.getCurrentLab.mockResolvedValue(lab);
  mocks.parseServerEnvironment.mockReturnValue({
    LAB_INSTANCE_PUBLIC_URL: 'https://lab.example.test',
    QR_SIGNING_SECRET: 'qr-signing-secret',
  });
});

describe('attendee routes', () => {
  it('renders a stable attendance landing page without an active session', async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);

    const page = await AttendancePage();
    const text = collectText(page);

    expect(text).toContain('Escanee el código QR');
    expect(text).toContain('Sin sesión activa');
    expect(text).toContain(lab.name);
  });

  it('replaces an invalid pending credential with the QR exchange flow', async () => {
    mocks.cookies.mockResolvedValue({
      get: () => ({ value: 'invalid-pending-token' }),
    });
    mocks.verifyPendingAttendanceScanToken.mockReturnValue(null);

    const page = asElement(await ScanPage());

    expect(page.type).toBe(mocks.ScanQrExchange);
    expect(page.props).toMatchObject({
      emptyTokenMessage:
        'El código QR anterior ya no está vigente. Escanee el código visible actualmente en la pantalla del laboratorio.',
      labName: lab.name,
    });
    expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
  });

  it('keeps checkout available outside entry hours', async () => {
    const checkedInAt = new Date('2026-09-03T12:00:00.000Z');

    mocks.cookies.mockResolvedValue({
      get: () => ({ value: 'valid-pending-token' }),
    });
    mocks.verifyPendingAttendanceScanToken.mockReturnValue({ window: 123 });
    mocks.getCurrentUserContext.mockResolvedValue({
      user: {
        access: 'ATTENDEE',
        id: 'attendee-id',
        name: 'Persona asistente',
      },
    });
    mocks.getAttendanceScanPreview.mockResolvedValue({
      attendanceClosesAtMinute: 1080,
      attendanceOpensAtMinute: 420,
      checkedInAt,
      checkInAllowed: false,
      nextAction: 'CHECK_OUT',
      visitId: 'visit-id',
    });

    const page = asElement(await ScanPage());

    expect(page.type).toBe(mocks.AttendanceScanConfirmation);
    expect(page.props).toMatchObject({
      checkedInAt: checkedInAt.toISOString(),
      nextAction: 'CHECK_OUT',
      visitId: 'visit-id',
    });
  });
});

describe('public QR display', () => {
  it('continues rendering a QR while entry is closed', async () => {
    const refreshAt = new Date('2026-09-03T18:01:00.000Z');

    mocks.cookies.mockResolvedValue({
      get: () => ({ value: 'display-session-token' }),
    });
    mocks.getValidQrDisplaySession.mockResolvedValue({
      expiresAt: new Date('2026-09-04T06:00:00.000Z'),
      label: 'Entrada principal',
    });
    mocks.reconcileLabAttendance.mockResolvedValue({
      attendanceClosesAtMinute: 1080,
      attendanceOpensAtMinute: 420,
      isOpen: false,
      now: new Date('2026-09-03T18:00:00.000Z'),
    });
    mocks.createRotatingQrToken.mockReturnValue({
      refreshAt,
      token: 'rotating-token',
    });

    const page = await PublicDisplayPage();
    const qrElement = findElement(
      page,
      (element) => element.type === mocks.QRCodeSVG,
    );

    expect(collectText(page)).toContain('Entradas cerradas');
    expect(qrElement).not.toBeNull();
    expect(qrElement?.props.value).toBe(
      'https://lab.example.test/scan#rotating-token',
    );
  });
});
