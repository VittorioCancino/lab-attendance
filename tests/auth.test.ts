import { describe, expect, it } from 'vitest';

import { canUseLoginSurface } from '@/lib/auth/credentials';
import { getLandingPath } from '@/lib/auth/landing';
import {
  authLoginSchema,
  changePasswordSchema,
  loginSchema,
} from '@/lib/types/auth.types';

describe('loginSchema', () => {
  it('normalizes the email used for local credentials', () => {
    expect(
      loginSchema.parse({
        email: ' ADMIN@LAB.LOCAL ',
        password: 'valid-password',
      }),
    ).toEqual({
      email: 'admin@lab.local',
      password: 'valid-password',
    });
  });

  it('rejects malformed credentials', () => {
    expect(() =>
      loginSchema.parse({ email: 'not-an-email', password: '' }),
    ).toThrow();
  });
});

describe('authLoginSchema', () => {
  it('requires an explicit trusted login surface', () => {
    expect(
      authLoginSchema.parse({
        email: 'manager@lab.local',
        password: 'valid-password',
        surface: 'STAFF',
      }),
    ).toMatchObject({ surface: 'STAFF' });
    expect(
      authLoginSchema.safeParse({
        email: 'manager@lab.local',
        password: 'valid-password',
      }).success,
    ).toBe(false);
  });
});

describe('canUseLoginSurface', () => {
  it.each([
    ['GLOBAL_ADMIN', 'STAFF', true],
    ['MANAGER', 'STAFF', true],
    ['ATTENDEE', 'STAFF', false],
    ['ATTENDEE', 'ATTENDANCE', true],
    ['MANAGER', 'ATTENDANCE', false],
    ['GLOBAL_ADMIN', 'ATTENDANCE', false],
  ] as const)('maps %s on %s to %s', (access, surface, expected) => {
    expect(canUseLoginSurface(access, surface)).toBe(expected);
  });
});

describe('changePasswordSchema', () => {
  it('accepts a distinct confirmed password with at least 12 characters', () => {
    expect(
      changePasswordSchema.parse({
        confirmation: 'new-password-value',
        currentPassword: 'current-password',
        newPassword: 'new-password-value',
      }),
    ).toEqual({
      confirmation: 'new-password-value',
      currentPassword: 'current-password',
      newPassword: 'new-password-value',
    });
  });

  it('rejects a reused or mismatched password', () => {
    expect(() =>
      changePasswordSchema.parse({
        confirmation: 'different-password',
        currentPassword: 'current-password',
        newPassword: 'current-password',
      }),
    ).toThrow();
  });
});

describe('getLandingPath', () => {
  it.each([
    ['GLOBAL_ADMIN', '/admin'],
    ['MANAGER', '/manager'],
    ['ATTENDEE', '/attendance'],
  ] as const)('routes %s access to %s', (access, path) => {
    expect(getLandingPath(access)).toBe(path);
  });
});
