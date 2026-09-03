import type { UserAccessLevel } from '@/lib/db/user-access';

export function getLandingPath(access: UserAccessLevel): string {
  switch (access) {
    case 'GLOBAL_ADMIN':
      return '/admin';
    case 'MANAGER':
      return '/manager';
    case 'ATTENDEE':
      return '/attendance';
  }
}
