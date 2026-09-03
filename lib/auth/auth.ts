import 'server-only';

import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import {
  canUseLoginSurface,
  verifyLoginCredentials,
} from '@/lib/auth/credentials';
import { verifyPendingAttendanceScanToken } from '@/lib/auth/qr-tokens';
import { PENDING_ATTENDANCE_SCAN_COOKIE_NAME } from '@/lib/const/qr';
import { prisma } from '@/lib/db/prisma';
import { consumeRateLimit } from '@/lib/db/rate-limits';
import { parseServerEnvironment } from '@/lib/env';
import { logSecurityAudit } from '@/lib/logging/security-audit';
import {
  authLoginSchema,
  LOGIN_SURFACE_DENIED_CODE,
} from '@/lib/types/auth.types';
import { getCurrentLab } from '@/lib/tenant/current-lab';

class LoginSurfaceDenied extends CredentialsSignin {
  code = LOGIN_SURFACE_DENIED_CODE;
}

function getRequestCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get('cookie');

  if (cookieHeader === null) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');

    if (separator > 0 && cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }

  return undefined;
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  cookies: {
    callbackUrl: { name: 'lab-attendance.callback-url' },
    csrfToken: { name: 'lab-attendance.csrf-token' },
    sessionToken: { name: 'lab-attendance.session-token' },
  },
  pages: {
    signIn: '/auth/signin',
  },
  logger: {
    debug: () => undefined,
    error: () => {
      logSecurityAudit({
        event: 'AUTH_LIBRARY',
        outcome: 'FAILED',
        reason: 'ERROR',
      });
    },
    warn: () => {
      logSecurityAudit({
        event: 'AUTH_LIBRARY',
        outcome: 'REJECTED',
        reason: 'WARNING',
      });
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Correo electrónico', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
        surface: { label: 'Tipo de acceso', type: 'text' },
      },
      async authorize(rawCredentials, request) {
        const parsed = authLoginSchema.safeParse(rawCredentials);

        if (!parsed.success) {
          return null;
        }

        const lab = await getCurrentLab();
        const environment = parseServerEnvironment(process.env);

        if (parsed.data.surface === 'ATTENDANCE') {
          const pendingToken = getRequestCookie(
            request,
            PENDING_ATTENDANCE_SCAN_COOKIE_NAME,
          );

          if (
            pendingToken === undefined ||
            verifyPendingAttendanceScanToken(
              environment.QR_SIGNING_SECRET,
              lab.id,
              pendingToken,
            ) === null
          ) {
            logSecurityAudit({
              event: 'AUTHENTICATION',
              labId: lab.id,
              outcome: 'REJECTED',
              reason: 'ATTENDANCE_CREDENTIAL_INVALID',
              surface: parsed.data.surface,
            });

            return null;
          }
        }

        const rateLimit = await consumeRateLimit(prisma, {
          action: 'AUTH_CREDENTIALS',
          labId: lab.id,
          secret: environment.AUTH_SECRET,
          subject: parsed.data.email,
        });

        if (rateLimit.status !== 'ALLOWED') {
          logSecurityAudit({
            event: 'AUTHENTICATION',
            labId: lab.id,
            outcome: rateLimit.status === 'LIMITED' ? 'REJECTED' : 'FAILED',
            reason:
              rateLimit.status === 'LIMITED'
                ? 'RATE_LIMITED'
                : 'DEPENDENCY_UNAVAILABLE',
            surface: parsed.data.surface,
          });

          return null;
        }

        const identity = await verifyLoginCredentials(
          prisma,
          lab.id,
          parsed.data,
        );

        if (identity === null) {
          logSecurityAudit({
            event: 'AUTHENTICATION',
            labId: lab.id,
            outcome: 'REJECTED',
            reason: 'CREDENTIALS_INVALID',
            surface: parsed.data.surface,
          });

          return null;
        }

        if (!canUseLoginSurface(identity.access, parsed.data.surface)) {
          logSecurityAudit({
            actorUserId: identity.id,
            event: 'AUTHENTICATION',
            labId: lab.id,
            outcome: 'REJECTED',
            reason: 'SURFACE_DENIED',
            surface: parsed.data.surface,
          });

          throw new LoginSurfaceDenied();
        }

        logSecurityAudit({
          actorUserId: identity.id,
          event: 'AUTHENTICATION',
          labId: lab.id,
          outcome: 'SUCCEEDED',
          reason: 'VERIFIED',
          surface: parsed.data.surface,
        });

        return {
          email: identity.email,
          id: identity.id,
          labId: identity.labId,
          name: identity.name,
          sessionVersion: identity.sessionVersion,
        };
      },
    }),
  ],
  session: {
    maxAge: 8 * 60 * 60,
    strategy: 'jwt',
  },
  useSecureCookies:
    process.env.LAB_INSTANCE_PUBLIC_URL === undefined
      ? process.env.NODE_ENV === 'production'
      : new URL(process.env.LAB_INSTANCE_PUBLIC_URL).protocol === 'https:',
  callbacks: {
    jwt({ account, token, user }) {
      if (account?.provider === 'credentials') {
        token.userId = user.id;
        token.labId = user.labId;
        token.sessionVersion = user.sessionVersion;
      }

      return token;
    },
    session({ session, token }) {
      if (typeof token.userId === 'string') {
        session.user.id = token.userId;
      }

      if (typeof token.labId === 'string') {
        session.labId = token.labId;
      }

      if (typeof token.sessionVersion === 'number') {
        session.sessionVersion = token.sessionVersion;
      }

      return session;
    },
  },
});
