import { createHash, randomBytes } from 'node:crypto';

export interface InvitationToken {
  hash: string;
  value: string;
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateInvitationToken(): InvitationToken {
  const value = randomBytes(32).toString('base64url');

  return { hash: hashInvitationToken(value), value };
}
