import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LabMembershipRole } from '@/app/generated/prisma/client';
import {
  getEntriesByDay,
  getHourlyMaxForDay,
  getMonthSummary,
  getTopUsersByTime,
} from '@/lib/db/attendance-stats';
import { updateLabCapacity } from '@/lib/db/lab-settings';
import { createPrismaClient } from '@/lib/db/client';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

const prisma = createPrismaClient(databaseUrl);

beforeEach(async () => {
  await prisma.attendanceScan.deleteMany();
  await prisma.attendanceVisit.deleteMany();
  await prisma.qrDisplaySession.deleteMany();
  await prisma.qrDisplayActivation.deleteMany();
  await prisma.labInvitation.deleteMany();
  await prisma.labMembership.deleteMany();
  await prisma.lab.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createLab(slug: string) {
  return prisma.lab.create({
    data: {
      attendanceClosesAtMinute: 1080,
      attendanceOpensAtMinute: 420,
      maxOccupancy: 10,
      name: `Laboratorio ${slug}`,
      slug,
      timezone: 'America/Santiago',
    },
  });
}

async function createMember(email: string, labId: string) {
  return prisma.user.create({
    data: {
      email,
      name: email,
      passwordHash: 'not-used-in-stats-tests',
      memberships: {
        create: { labId, role: LabMembershipRole.ATTENDEE },
      },
    },
  });
}

describe('attendance stats', () => {
  it('actualiza la capacidad con control optimista', async () => {
    const lab = await createLab('capacity-lab');
    const ok = await updateLabCapacity(prisma, {
      expectedMaxOccupancy: 10,
      labId: lab.id,
      maxOccupancy: 25,
    });
    expect(ok).toEqual({ maxOccupancy: 25, ok: true });

    const stale = await updateLabCapacity(prisma, {
      expectedMaxOccupancy: 10,
      labId: lab.id,
      maxOccupancy: 30,
    });
    expect(stale).toEqual({ ok: false, reason: 'STATE_CHANGED' });
  });

  it('resume el mes excluyendo fines de semana y feriados', async () => {
    const lab = await createLab('summary-lab');
    const ana = await createMember('ana@test.local', lab.id);
    const beto = await createMember('beto@test.local', lab.id);

    // Lun 14 sep 2026 09:00-11:00 Santiago (12:00-14:00Z).
    await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-09-14T12:00:00.000Z'),
        checkInMethod: 'QR',
        checkedOutAt: new Date('2026-09-14T14:00:00.000Z'),
        checkOutMethod: 'QR',
        labId: lab.id,
        userId: ana.id,
      },
    });
    // Lun 14 sep 10:00-10:30 Santiago.
    await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-09-14T13:00:00.000Z'),
        checkInMethod: 'QR',
        checkedOutAt: new Date('2026-09-14T13:30:00.000Z'),
        checkOutMethod: 'QR',
        labId: lab.id,
        userId: beto.id,
      },
    });

    const now = new Date('2026-09-30T15:00:00.000Z');
    const { summary } = await getMonthSummary(prisma, lab.id, '2026-09', now);

    expect(summary.businessDaysTotal).toBe(21);
    expect(summary.entriesTotal).toBe(2);
    // 21 días hábiles × 11 h = 231 h; capacidad 10 → 2310 h disponibles.
    expect(summary.openHours).toBe(231);
    expect(summary.hoursAvailable).toBe(2310);
    // 2 h + 0.5 h = 2.5 h usadas.
    expect(summary.hoursUsed).toBeCloseTo(2.5, 5);
    expect(summary.occupancyRate).toBeCloseTo(2.5 / 2310, 8);
    expect(summary.registeredUsers).toBe(2);
    // 2 entradas / 21 días hábiles.
    expect(summary.avgEntriesPerOpenDay).toBeCloseTo(2 / 21, 8);
    // Dos personas-día: 120 min y 30 min → promedio 75 min.
    expect(summary.avgStayMinutesPerPersonDay).toBeCloseTo(75, 5);
  });

  it('calcula el máximo por bloque horario del día', async () => {
    const lab = await createLab('hourly-lab');
    const ana = await createMember('ana@test.local', lab.id);
    const beto = await createMember('beto@test.local', lab.id);

    await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-09-14T12:00:00.000Z'),
        checkInMethod: 'QR',
        checkedOutAt: new Date('2026-09-14T14:00:00.000Z'),
        checkOutMethod: 'QR',
        labId: lab.id,
        userId: ana.id,
      },
    });
    await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-09-14T13:00:00.000Z'),
        checkInMethod: 'QR',
        checkedOutAt: new Date('2026-09-14T13:30:00.000Z'),
        checkOutMethod: 'QR',
        labId: lab.id,
        userId: beto.id,
      },
    });

    const { points } = await getHourlyMaxForDay(
      prisma,
      lab.id,
      '2026-09-14',
      new Date('2026-09-14T20:00:00.000Z'),
    );
    const byHour = new Map(
      points.map((point) => [point.hourLabel, point.occupancy]),
    );
    // 09:00-09:59 solo Ana; 10:00-10:59 Ana+Beto; 11:00 Ana.
    expect(byHour.get('09:00')).toBe(1);
    expect(byHour.get('10:00')).toBe(2);
    expect(points[0]?.hourLabel).toBe('07:00');
    expect(points.at(-1)?.hourLabel).toBe('17:00');
  });

  it('agrega entradas por día y ranking', async () => {
    const lab = await createLab('ranking-lab');
    const ana = await createMember('ana@test.local', lab.id);
    const beto = await createMember('beto@test.local', lab.id);

    await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-09-14T12:00:00.000Z'),
        checkInMethod: 'QR',
        checkedOutAt: new Date('2026-09-14T15:00:00.000Z'),
        checkOutMethod: 'QR',
        labId: lab.id,
        userId: ana.id,
      },
    });
    await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-09-15T12:00:00.000Z'),
        checkInMethod: 'QR',
        checkedOutAt: new Date('2026-09-15T12:30:00.000Z'),
        checkOutMethod: 'QR',
        labId: lab.id,
        userId: beto.id,
      },
    });

    const now = new Date('2026-09-30T15:00:00.000Z');
    const { points } = await getEntriesByDay(prisma, lab.id, '2026-09', now);
    expect(points).toHaveLength(30);
    expect(points.find((point) => point.day === 14)?.entries).toBe(1);
    expect(points.find((point) => point.day === 15)?.entries).toBe(1);
    expect(points.find((point) => point.day === 16)?.entries).toBe(0);
    expect(points.find((point) => point.day === 18)?.isBusinessDay).toBe(false);

    const { entries } = await getTopUsersByTime(
      prisma,
      lab.id,
      { monthKey: '2026-09', scope: 'month' },
      now,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]?.userId).toBe(ana.id);
    expect(entries[0]?.totalMinutes).toBe(180);
    expect(entries[1]?.userId).toBe(beto.id);
  });
});
