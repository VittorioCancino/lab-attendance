import 'server-only';

import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { getAuthorizedUser, type AuthorizedUser } from '@/lib/db/user-access';
import { getCurrentLab, type CurrentLab } from '@/lib/tenant/current-lab';

export interface CurrentUserContext {
  lab: CurrentLab;
  user: AuthorizedUser;
}

export async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
  const session = await auth();

  if (
    session?.user.id === undefined ||
    session.labId === undefined ||
    session.sessionVersion === undefined
  ) {
    return null;
  }

  const lab = await getCurrentLab();

  if (session.labId !== lab.id) {
    return null;
  }

  const user = await getAuthorizedUser(prisma, session.user.id, lab.id);

  if (user?.sessionVersion !== session.sessionVersion) {
    return null;
  }

  return { lab, user };
}
