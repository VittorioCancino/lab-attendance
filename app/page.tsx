import { redirect } from 'next/navigation';

import { getCurrentUserContext } from '@/lib/auth/current-user';
import { getLandingPath } from '@/lib/auth/landing';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const context = await getCurrentUserContext();

  if (context === null) {
    redirect('/auth/signin');
  }

  redirect(getLandingPath(context.user.access));
}
