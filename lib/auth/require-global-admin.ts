import 'server-only';

import { redirect } from 'next/navigation';

import { getCurrentUserContext } from '@/lib/auth/current-user';
import { getLandingPath } from '@/lib/auth/landing';

export async function requireGlobalAdministrator() {
  const context = await getCurrentUserContext();

  if (context === null) {
    redirect('/auth/signin');
  }

  if (context.user.access !== 'GLOBAL_ADMIN') {
    redirect(getLandingPath(context.user.access));
  }

  return context;
}
