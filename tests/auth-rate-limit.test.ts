import { beforeEach, describe, expect, it, vi } from 'vitest';

interface CapturedAuthOptions {
  providers: {
    authorize: (
      credentials: unknown,
      request: Request,
    ) => Promise<Record<string, unknown> | null>;
  }[];
}

const mocks = vi.hoisted(() => {
  const authOptions: { current: unknown } = { current: null };

  return {
    authOptions,
    canUseLoginSurface: vi.fn(),
    consumeRateLimit: vi.fn(),
    getCurrentLab: vi.fn(),
    parseServerEnvironment: vi.fn(),
    verifyLoginCredentials: vi.fn(),
    verifyPendingAttendanceScanToken: vi.fn(),
  };
});

vi.mock('next-auth', () => {
  class CredentialsSignin extends Error {
    code = 'credentials';
  }

  return {
    CredentialsSignin,
    default: (options: unknown) => {
      mocks.authOptions.current = options;

      return {
        auth: vi.fn(),
        handlers: {},
        signIn: vi.fn(),
        signOut: vi.fn(),
      };
    },
  };
});
vi.mock('next-auth/providers/credentials', () => ({
  default: (options: unknown) => options,
}));
vi.mock('@/lib/auth/credentials', () => ({
  canUseLoginSurface: mocks.canUseLoginSurface,
  verifyLoginCredentials: mocks.verifyLoginCredentials,
}));
vi.mock('@/lib/auth/qr-tokens', () => ({
  verifyPendingAttendanceScanToken: mocks.verifyPendingAttendanceScanToken,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/db/rate-limits', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));
vi.mock('@/lib/env', () => ({
  parseServerEnvironment: mocks.parseServerEnvironment,
}));
vi.mock('@/lib/logging/security-audit', () => ({
  logSecurityAudit: vi.fn(),
}));
vi.mock('@/lib/tenant/current-lab', () => ({
  getCurrentLab: mocks.getCurrentLab,
}));

await import('@/lib/auth/auth');

const environment = {
  AUTH_SECRET: 'auth-secret-for-tests',
  QR_SIGNING_SECRET: 'qr-signing-secret-for-tests',
};
const lab = { id: 'trusted-lab-id' };

function getAuthorize() {
  const options = mocks.authOptions.current as CapturedAuthOptions;
  const provider = options.providers.at(0);

  if (provider === undefined) {
    throw new Error('Expected a credentials provider.');
  }

  return provider.authorize;
}

beforeEach(() => {
  for (const mock of [
    mocks.canUseLoginSurface,
    mocks.consumeRateLimit,
    mocks.getCurrentLab,
    mocks.parseServerEnvironment,
    mocks.verifyLoginCredentials,
    mocks.verifyPendingAttendanceScanToken,
  ]) {
    mock.mockReset();
  }

  mocks.getCurrentLab.mockResolvedValue(lab);
  mocks.parseServerEnvironment.mockReturnValue(environment);
});

describe('credential authorization rate limit', () => {
  it('normalizes and limits the email before password verification', async () => {
    mocks.consumeRateLimit.mockResolvedValue({ status: 'LIMITED' });

    const result = await getAuthorize()(
      {
        email: ' Person@Test.Local ',
        password: 'incorrect-password',
        surface: 'STAFF',
      },
      new Request('https://lab.example.test/api/auth/callback/credentials'),
    );

    expect(result).toBeNull();
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      {},
      {
        action: 'AUTH_CREDENTIALS',
        labId: lab.id,
        secret: environment.AUTH_SECRET,
        subject: 'person@test.local',
      },
    );
    expect(mocks.verifyLoginCredentials).not.toHaveBeenCalled();
  });

  it('rejects an invalid attendance credential before consuming a login attempt', async () => {
    mocks.verifyPendingAttendanceScanToken.mockReturnValue(null);

    const result = await getAuthorize()(
      {
        email: 'person@test.local',
        password: 'incorrect-password',
        surface: 'ATTENDANCE',
      },
      new Request('https://lab.example.test/api/auth/callback/credentials', {
        headers: {
          Cookie: 'lab-attendance.pending-scan=invalid-pending-token',
        },
      }),
    );

    expect(result).toBeNull();
    expect(mocks.verifyPendingAttendanceScanToken).toHaveBeenCalledWith(
      environment.QR_SIGNING_SECRET,
      lab.id,
      'invalid-pending-token',
    );
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
    expect(mocks.verifyLoginCredentials).not.toHaveBeenCalled();
  });
});
