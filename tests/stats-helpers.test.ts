import { describe, expect, it } from 'vitest';

import {
  businessDaysInMonth,
  currentDayKey,
  currentMonthKey,
  getDayBounds,
  getMonthBounds,
  overlapMinutes,
  toDateKey,
  zonedTimeToUtc,
} from '@/lib/db/attendance-stats';
import {
  statsCapacityFormSchema,
  statsDaySchema,
  statsMonthSchema,
} from '@/lib/types/stats.types';

describe('stats helpers de fecha', () => {
  it('convierte hora mural America/Santiago a UTC', () => {
    // Septiembre: UTC-3 en Santiago.
    const utc = zonedTimeToUtc(2026, 9, 14, 9, 0, 'America/Santiago');
    expect(utc.toISOString()).toBe('2026-09-14T12:00:00.000Z');
    expect(toDateKey(utc, 'America/Santiago')).toBe('2026-09-14');
  });

  it('delimita el mes en instantes UTC correctos', () => {
    const { end, start } = getMonthBounds('2026-09', 'America/Santiago');
    // 1 sep aún en horario de invierno (UTC-4); 1 oct ya en verano (UTC-3).
    expect(start.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('delimita un día cruzando fin de mes', () => {
    const { end, start } = getDayBounds('2026-09-30', 'America/Santiago');
    expect(toDateKey(start, 'America/Santiago')).toBe('2026-09-30');
    expect(toDateKey(new Date(end.getTime() - 1), 'America/Santiago')).toBe(
      '2026-09-30',
    );
    expect(toDateKey(end, 'America/Santiago')).toBe('2026-10-01');
  });

  it('calcula intersección en minutos', () => {
    const clipStart = new Date('2026-09-14T12:00:00.000Z');
    const clipEnd = new Date('2026-09-14T13:00:00.000Z');
    expect(
      overlapMinutes(
        new Date('2026-09-14T11:30:00.000Z'),
        new Date('2026-09-14T12:30:00.000Z'),
        clipStart,
        clipEnd,
      ),
    ).toBe(30);
    expect(
      overlapMinutes(
        new Date('2026-09-14T13:00:00.000Z'),
        new Date('2026-09-14T14:00:00.000Z'),
        clipStart,
        clipEnd,
      ),
    ).toBe(0);
  });

  it('septiembre 2026 tiene 21 días hábiles (sin finde ni feriados 18-19)', () => {
    const business = businessDaysInMonth('2026-09');
    expect(business).toHaveLength(21);
    expect(business).not.toContain('2026-09-18');
    expect(business).not.toContain('2026-09-19');
    expect(business).not.toContain('2026-09-20');
    expect(business).toContain('2026-09-14');
  });

  it('deriva mes y día actual en la zona del lab', () => {
    const now = new Date('2026-09-14T02:00:00.000Z'); // 13 sep 23:00 en Santiago
    expect(currentDayKey(now, 'America/Santiago')).toBe('2026-09-13');
    expect(currentMonthKey(now, 'America/Santiago')).toBe('2026-09');
  });
});

describe('stats validación zod', () => {
  it('acepta y rechaza meses', () => {
    expect(statsMonthSchema.safeParse('2026-09').success).toBe(true);
    expect(statsMonthSchema.safeParse('2026-13').success).toBe(false);
    expect(statsMonthSchema.safeParse('sep-2026').success).toBe(false);
  });

  it('acepta y rechaza días', () => {
    expect(statsDaySchema.safeParse('2026-09-14').success).toBe(true);
    expect(statsDaySchema.safeParse('2026-02-30').success).toBe(false);
    expect(statsDaySchema.safeParse('2026-9-4').success).toBe(false);
  });

  it('valida capacidad 1..10000 o vacía', () => {
    expect(
      statsCapacityFormSchema.safeParse({
        expectedMaxOccupancy: '',
        maxOccupancy: '40',
      }).success,
    ).toBe(true);
    expect(
      statsCapacityFormSchema.safeParse({
        expectedMaxOccupancy: '',
        maxOccupancy: '',
      }).success,
    ).toBe(true);
    expect(
      statsCapacityFormSchema.safeParse({
        expectedMaxOccupancy: '',
        maxOccupancy: '0',
      }).success,
    ).toBe(false);
    expect(
      statsCapacityFormSchema.safeParse({
        expectedMaxOccupancy: '',
        maxOccupancy: '10001',
      }).success,
    ).toBe(false);
  });
});
