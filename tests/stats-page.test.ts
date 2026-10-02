import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEntriesByDay: vi.fn(),
  getHourlyAverage: vi.fn(),
  getHourlyMaxForDay: vi.fn(),
  getMonthSummary: vi.fn(),
  getPresentNow: vi.fn(),
  getTopUsersByTime: vi.fn(),
  redirect: vi.fn(),
  requireLabManager: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/require-lab-manager', () => ({
  requireLabManager: mocks.requireLabManager,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/db/attendance-stats', () => ({
  currentDayKey: () => '2026-09-14',
  currentMonthKey: () => '2026-09',
  getEntriesByDay: mocks.getEntriesByDay,
  getHourlyAverage: mocks.getHourlyAverage,
  getHourlyMaxForDay: mocks.getHourlyMaxForDay,
  getMonthSummary: mocks.getMonthSummary,
  getPresentNow: mocks.getPresentNow,
  getTopUsersByTime: mocks.getTopUsersByTime,
}));
vi.mock('@/app/manager/stats/actions', () => ({
  updateLabCapacityAction: vi.fn(),
}));

import ManagerStatsPage from '@/app/manager/stats/page';

const lab = {
  attendanceClosesAtMinute: 1080,
  attendanceOpensAtMinute: 420,
  id: 'lab-id',
  maxOccupancy: 10,
  name: 'Laboratorio de prueba',
  slug: 'main-lab',
  timezone: 'America/Santiago',
};

function setupMocks() {
  mocks.requireLabManager.mockResolvedValue({
    lab: { id: lab.id, name: lab.name, timezone: lab.timezone },
    user: { id: 'manager-id' },
  });
  mocks.getPresentNow.mockResolvedValue({
    entries: [
      {
        checkedInAt: new Date('2026-09-14T12:00:00.000Z'),
        checkInMethod: 'QR',
        email: 'ana@test.local',
        minutesPresent: 120,
        name: 'Ana',
        userId: 'ana-id',
        visitId: 'visit-1',
      },
    ],
    lab,
    readAt: new Date('2026-09-14T14:00:00.000Z'),
  });
  mocks.getMonthSummary.mockResolvedValue({
    lab,
    summary: {
      avgEntriesPerOpenDay: 1.5,
      avgStayMinutesPerPersonDay: 75,
      businessDays: 10,
      businessDaysTotal: 21,
      entriesTotal: 15,
      hoursAvailable: 2310,
      hoursUsed: 20,
      monthKey: '2026-09',
      occupancyRate: 0.01,
      openHours: 231,
      personDays: 12,
      registeredUsers: 30,
    },
  });
  mocks.getHourlyMaxForDay.mockResolvedValue({
    lab,
    points: [{ hourLabel: '07:00', hourStartMinute: 420, occupancy: 1 }],
  });
  mocks.getHourlyAverage.mockResolvedValue({
    businessDays: 21,
    lab,
    points: [{ hourLabel: '07:00', hourStartMinute: 420, occupancy: 0.5 }],
  });
  mocks.getEntriesByDay.mockResolvedValue({
    lab,
    points: [
      { dateKey: '2026-09-01', day: 1, entries: 2, isBusinessDay: true },
    ],
  });
  mocks.getTopUsersByTime.mockResolvedValue({
    entries: [
      {
        email: 'ana@test.local',
        name: 'Ana',
        totalMinutes: 180,
        userId: 'ana-id',
        visitCount: 2,
      },
    ],
    lab,
  });
}

function collectText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean')
    return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node === 'object' && 'props' in (node as object)) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return collectText(props?.children);
  }
  return '';
}

describe('manager stats page', () => {
  it('renderiza las siete secciones con fallbacks de mes y día', async () => {
    setupMocks();
    const element = await ManagerStatsPage({
      searchParams: Promise.resolve({}),
    });
    const text = collectText(element);

    expect(text).toContain('Personas presentes');
    expect(text).toContain('Capacidad en uso');
    expect(text).toContain('Ocupación y promedios del mes');
    expect(text).toContain('Uso por hora del día');
    expect(text).toContain('Uso por hora en promedio');
    expect(text).toContain('Entradas por día del mes');
    expect(text).toContain('Quiénes más permanecen');
    expect(mocks.getMonthSummary).toHaveBeenCalledWith(
      {},
      lab.id,
      '2026-09',
      expect.any(Date),
    );
  });

  it('usa los filtros de la URL cuando son válidos', async () => {
    setupMocks();
    await ManagerStatsPage({
      searchParams: Promise.resolve({
        avgScope: 'history',
        day: '2026-09-10',
        month: '2026-08',
        topScope: 'history',
      }),
    });

    expect(mocks.getMonthSummary).toHaveBeenCalledWith(
      {},
      lab.id,
      '2026-08',
      expect.any(Date),
    );
    expect(mocks.getHourlyMaxForDay).toHaveBeenCalledWith(
      {},
      lab.id,
      '2026-09-10',
      expect.any(Date),
    );
    expect(mocks.getHourlyAverage).toHaveBeenCalledWith(
      {},
      lab.id,
      { scope: 'history' },
      expect.any(Date),
    );
  });
});
