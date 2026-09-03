import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  logSecurityAudit,
  type SecurityAuditEvent,
} from '@/lib/logging/security-audit';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('security audit logging', () => {
  it('writes one allowlisted JSON object without sensitive values', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const event: SecurityAuditEvent = {
      actorUserId: '11111111-1111-4111-8111-111111111111',
      event: 'INVITATION',
      invitationId: '22222222-2222-4222-8222-222222222222',
      labId: '33333333-3333-4333-8333-333333333333',
      operation: 'CREATE',
      outcome: 'SUCCEEDED',
      reason: 'CREATED',
      role: 'ATTENDEE',
    };

    logSecurityAudit(event);

    const line = write.mock.calls.at(0)?.at(0);

    expect(typeof line).toBe('string');

    if (typeof line !== 'string') {
      throw new Error('Expected one JSON audit line.');
    }

    const parsed = JSON.parse(line) as unknown;

    expect(parsed).toMatchObject({
      ...event,
      version: 1,
    });
    expect(
      typeof parsed === 'object' &&
        parsed !== null &&
        'timestamp' in parsed &&
        typeof parsed.timestamp === 'string',
    ).toBe(true);
    expect(line).not.toContain('person@test.local');
    expect(line).not.toContain('raw-invitation-token');
    expect(line.endsWith('\n')).toBe(true);
  });

  it('does not expose fields for email addresses or tokens', () => {
    const unsafeAuditExamples = () => {
      const withEmail: SecurityAuditEvent = {
        event: 'AUTH_LIBRARY',
        outcome: 'FAILED',
        reason: 'ERROR',
        // @ts-expect-error Audit events cannot carry email addresses.
        email: 'person@test.local',
      };
      const withToken: SecurityAuditEvent = {
        event: 'AUTH_LIBRARY',
        outcome: 'FAILED',
        reason: 'ERROR',
        // @ts-expect-error Audit events cannot carry raw tokens.
        token: 'raw-invitation-token',
      };

      return { withEmail, withToken };
    };

    expect(unsafeAuditExamples).toBeTypeOf('function');
  });
});
