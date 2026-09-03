import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteExpiredRateLimitBuckets: vi.fn(),
  getCurrentLab: vi.fn(),
  logSecurityAudit: vi.fn(),
  reconcileLabAttendance: vi.fn(),
  recordAttendanceCronSuccess: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/db/attendance-policy', () => ({
  reconcileLabAttendance: mocks.reconcileLabAttendance,
}));
vi.mock('@/lib/db/attendance-maintenance', () => ({
  recordAttendanceCronSuccess: mocks.recordAttendanceCronSuccess,
}));
vi.mock('@/lib/db/rate-limits', () => ({
  deleteExpiredRateLimitBuckets: mocks.deleteExpiredRateLimitBuckets,
}));
vi.mock('@/lib/logging/security-audit', () => ({
  logSecurityAudit: mocks.logSecurityAudit,
}));
vi.mock('@/lib/tenant/current-lab', () => ({
  getCurrentLab: mocks.getCurrentLab,
}));

import { POST } from '@/app/api/cron/attendance/close/route';

const secret = 'attendance-cron-secret-with-32-characters';

beforeEach(() => {
  process.env.ATTENDANCE_CRON_SECRET = secret;
  mocks.deleteExpiredRateLimitBuckets.mockReset();
  mocks.deleteExpiredRateLimitBuckets.mockResolvedValue(0);
  mocks.getCurrentLab.mockReset();
  mocks.logSecurityAudit.mockReset();
  mocks.reconcileLabAttendance.mockReset();
  mocks.recordAttendanceCronSuccess.mockReset();
  mocks.recordAttendanceCronSuccess.mockResolvedValue(true);
});

describe('attendance automatic-close route', () => {
  it('rejects unauthorized requests before resolving the tenant', async () => {
    const response = await POST(
      new Request('https://lab.example.test/api/cron/attendance/close', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    await expect(response.json()).resolves.toEqual({
      error: 'UNAUTHORIZED',
      ok: false,
    });
    expect(mocks.getCurrentLab).not.toHaveBeenCalled();
    expect(mocks.reconcileLabAttendance).not.toHaveBeenCalled();
  });

  it('reconciles only the configured lab for a valid bearer', async () => {
    const processedThrough = new Date('2026-09-02T18:00:00.000Z');

    mocks.getCurrentLab.mockResolvedValue({ id: 'trusted-lab-id' });
    mocks.reconcileLabAttendance.mockResolvedValue({
      closedVisitCount: 3,
      now: processedThrough,
    });

    const response = await POST(
      new Request('https://lab.example.test/api/cron/attendance/close', {
        headers: { Authorization: `Bearer ${secret}` },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      closedVisitCount: 3,
      ok: true,
      processedThrough: processedThrough.toISOString(),
    });
    expect(mocks.reconcileLabAttendance).toHaveBeenCalledWith(
      {},
      { labId: 'trusted-lab-id' },
    );
    expect(mocks.recordAttendanceCronSuccess).toHaveBeenCalledWith(
      {},
      {
        labId: 'trusted-lab-id',
        succeededAt: processedThrough,
      },
    );
    expect(mocks.deleteExpiredRateLimitBuckets).toHaveBeenCalledWith(
      {},
      'trusted-lab-id',
    );
  });

  it('keeps a completed closure successful when ancillary cleanup fails', async () => {
    const processedThrough = new Date('2026-09-02T18:00:00.000Z');

    mocks.getCurrentLab.mockResolvedValue({ id: 'trusted-lab-id' });
    mocks.reconcileLabAttendance.mockResolvedValue({
      closedVisitCount: 1,
      now: processedThrough,
    });
    mocks.deleteExpiredRateLimitBuckets.mockRejectedValue(
      new Error('Cleanup unavailable'),
    );

    const response = await POST(
      new Request('https://lab.example.test/api/cron/attendance/close', {
        headers: { Authorization: `Bearer ${secret}` },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.logSecurityAudit).toHaveBeenCalledWith({
      event: 'ATTENDANCE_CRON',
      labId: 'trusted-lab-id',
      operation: 'CLEANUP',
      outcome: 'FAILED',
      reason: 'CLEANUP_FAILED',
    });
  });

  it('fails closed when the secret is missing or the instance is unavailable', async () => {
    delete process.env.ATTENDANCE_CRON_SECRET;

    const missingSecretResponse = await POST(
      new Request('https://lab.example.test/api/cron/attendance/close', {
        method: 'POST',
      }),
    );

    expect(missingSecretResponse.status).toBe(503);
    expect(mocks.getCurrentLab).not.toHaveBeenCalled();

    process.env.ATTENDANCE_CRON_SECRET = secret;
    mocks.getCurrentLab.mockRejectedValue(new Error('Unavailable'));

    const unavailableResponse = await POST(
      new Request('https://lab.example.test/api/cron/attendance/close', {
        headers: { Authorization: `Bearer ${secret}` },
        method: 'POST',
      }),
    );

    expect(unavailableResponse.status).toBe(503);
    await expect(unavailableResponse.json()).resolves.toEqual({
      error: 'INSTANCE_UNAVAILABLE',
      ok: false,
    });
  });
});
