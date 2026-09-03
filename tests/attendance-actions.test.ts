import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/lib/auth/auth', () => ({ signOut: mocks.signOut }));

import {
  attendeeLogoutAction,
  switchAttendanceAccountAction,
} from '@/app/attendance/actions';

beforeEach(() => {
  mocks.signOut.mockReset();
  mocks.signOut.mockResolvedValue(undefined);
});

describe('attendee session actions', () => {
  it('returns a signed-out attendee to the attendance landing page', async () => {
    await attendeeLogoutAction();

    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: '/attendance' });
  });

  it('switches accounts without leaving the QR-gated sign-in flow', async () => {
    await switchAttendanceAccountAction();

    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: '/scan/signin' });
  });
});
