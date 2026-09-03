'use server';

import { signOut } from '@/lib/auth/auth';

export async function attendeeLogoutAction(): Promise<void> {
  await signOut({ redirectTo: '/attendance' });
}

export async function switchAttendanceAccountAction(): Promise<void> {
  await signOut({ redirectTo: '/scan/signin' });
}
