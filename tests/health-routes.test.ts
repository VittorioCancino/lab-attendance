import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findCronState: vi.fn(),
  getAttendanceCronHealth: vi.fn(),
  getCurrentLab: vi.fn(),
  parseAttendanceCronSecret: vi.fn(),
  parseServerEnvironment: vi.fn(),
}));

vi.mock('@/lib/db/attendance-maintenance', () => ({
  getAttendanceCronHealth: mocks.getAttendanceCronHealth,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    attendanceCronState: { findUnique: mocks.findCronState },
  },
}));
vi.mock('@/lib/env', () => ({
  parseAttendanceCronSecret: mocks.parseAttendanceCronSecret,
  parseServerEnvironment: mocks.parseServerEnvironment,
}));
vi.mock('@/lib/tenant/current-lab', () => ({
  getCurrentLab: mocks.getCurrentLab,
}));

import { GET as getAttendanceCloseHealth } from '@/app/api/health/attendance-close/route';
import { GET as getLiveness } from '@/app/api/health/live/route';
import { GET as getReadiness } from '@/app/api/health/ready/route';

beforeEach(() => {
  for (const mock of [
    mocks.findCronState,
    mocks.getAttendanceCronHealth,
    mocks.getCurrentLab,
    mocks.parseAttendanceCronSecret,
    mocks.parseServerEnvironment,
  ]) {
    mock.mockReset();
  }

  mocks.findCronState.mockResolvedValue(null);
  mocks.getCurrentLab.mockResolvedValue({ id: 'trusted-lab-id' });
  mocks.parseAttendanceCronSecret.mockReturnValue('valid-cron-secret');
  mocks.parseServerEnvironment.mockReturnValue({});
});

describe('health routes', () => {
  it('reports process liveness without dependencies', async () => {
    const response = getLiveness();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: 'LIVE',
    });
  });

  it('reports readiness after configuration, tenant, database, and schema checks', async () => {
    const response = await getReadiness();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: 'READY',
    });
    expect(mocks.findCronState).toHaveBeenCalledWith({
      select: { labId: true },
      where: { labId: 'trusted-lab-id' },
    });
  });

  it('fails readiness closed for missing cron configuration', async () => {
    mocks.parseAttendanceCronSecret.mockReturnValue(null);

    const response = await getReadiness();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      status: 'UNAVAILABLE',
    });
    expect(mocks.getCurrentLab).not.toHaveBeenCalled();
  });

  it.each(['MISSING', 'STALE'] as const)(
    'reports a %s attendance-close heartbeat as unavailable',
    async (status) => {
      mocks.getAttendanceCronHealth.mockResolvedValue({
        checkedAt: new Date(),
        status,
      });

      const response = await getAttendanceCloseHealth();

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ ok: false, status });
    },
  );

  it('reports a fresh attendance-close heartbeat', async () => {
    mocks.getAttendanceCronHealth.mockResolvedValue({
      checkedAt: new Date(),
      lastSucceededAt: new Date(),
      status: 'FRESH',
    });

    const response = await getAttendanceCloseHealth();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: 'FRESH',
    });
    expect(mocks.getAttendanceCronHealth).toHaveBeenCalledWith(
      expect.anything(),
      'trusted-lab-id',
    );
  });
});
