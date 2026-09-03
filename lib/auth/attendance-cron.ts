import 'server-only';

import { timingSafeEqual } from 'node:crypto';

const BEARER_PREFIX = 'Bearer ';
const MAX_SECRET_LENGTH = 512;

export function isValidAttendanceCronAuthorization(
  authorization: string | null,
  expectedSecret: string,
): boolean {
  if (authorization?.startsWith(BEARER_PREFIX) !== true) {
    return false;
  }

  const receivedSecret = authorization.slice(BEARER_PREFIX.length);

  if (
    receivedSecret.length === 0 ||
    receivedSecret.length > MAX_SECRET_LENGTH
  ) {
    return false;
  }

  const expected = Buffer.from(expectedSecret);
  const received = Buffer.from(receivedSecret);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
