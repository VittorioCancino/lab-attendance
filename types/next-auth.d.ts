import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    labId?: string;
    sessionVersion?: number;
  }

  interface Session extends DefaultSession {
    labId?: string;
    sessionVersion?: number;
    user: DefaultSession['user'] & {
      id?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    labId?: string;
    sessionVersion?: number;
    userId?: string;
  }
}
