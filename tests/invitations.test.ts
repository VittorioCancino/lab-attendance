import { describe, expect, it } from 'vitest';

import {
  generateInvitationToken,
  hashInvitationToken,
} from '@/lib/auth/invitation-token';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationTokenSchema,
} from '@/lib/types/membership.types';

describe('invitation tokens', () => {
  it('generates unique URL-safe values and deterministic hashes', () => {
    const first = generateInvitationToken();
    const second = generateInvitationToken();

    expect(first.value).not.toBe(second.value);
    expect(invitationTokenSchema.parse(first.value)).toBe(first.value);
    expect(first.hash).toBe(hashInvitationToken(first.value));
    expect(first.hash).not.toContain(first.value);
  });
});

describe('invitation contracts', () => {
  it('normalizes invitation email addresses', () => {
    expect(
      createInvitationSchema.parse({
        email: ' PERSON@LAB.LOCAL ',
        name: 'Persona de Prueba',
        role: 'ATTENDEE',
      }),
    ).toEqual({
      email: 'person@lab.local',
      name: 'Persona de Prueba',
      role: 'ATTENDEE',
    });
  });

  it('rejects email addresses longer than the database limit', () => {
    expect(
      createInvitationSchema.safeParse({
        email: `${'a'.repeat(245)}@test.local`,
        name: 'Persona de Prueba',
        role: 'ATTENDEE',
      }).success,
    ).toBe(false);
  });

  it('requires a confirmed password with at least 12 characters', () => {
    const token = generateInvitationToken().value;

    expect(
      acceptInvitationSchema.safeParse({
        confirmation: 'new-password-value',
        password: 'new-password-value',
        token,
      }).success,
    ).toBe(true);
    expect(
      acceptInvitationSchema.safeParse({
        confirmation: 'different-password',
        password: 'new-password-value',
        token,
      }).success,
    ).toBe(false);
  });
});
