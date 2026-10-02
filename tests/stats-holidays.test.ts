import { describe, expect, it } from 'vitest';

import { chileanHolidaysForYear, isChileanHoliday } from '@/lib/holidays/chile';
import { isBusinessDateKey } from '@/lib/db/attendance-stats';

describe('feriados chilenos', () => {
  it('incluye fijos e irrenunciables', () => {
    expect(isChileanHoliday('2026-01-01')).toBe(true);
    expect(isChileanHoliday('2026-05-01')).toBe(true);
    expect(isChileanHoliday('2026-09-18')).toBe(true);
    expect(isChileanHoliday('2026-09-19')).toBe(true);
    expect(isChileanHoliday('2026-12-25')).toBe(true);
  });

  it('calcula Semana Santa (2026: 3 y 4 de abril)', () => {
    expect(isChileanHoliday('2026-04-03')).toBe(true);
    expect(isChileanHoliday('2026-04-04')).toBe(true);
    expect(isChileanHoliday('2026-04-05')).toBe(false);
  });

  it('aplica puente de septiembre cuando corresponde', () => {
    // 2026: 18 vie + 19 sáb -> sin puente extra.
    expect(chileanHolidaysForYear(2026).has('2026-09-17')).toBe(false);
    // 2023: 18 lun + 19 mar -> sin puente; 2022: 18 dom + 19 lun -> sin puente.
    // 2024: 18 mié + 19 jue -> viernes 20 feriado.
    expect(chileanHolidaysForYear(2024).has('2024-09-20')).toBe(true);
    // 2025: 18 jue + 19 vie -> sin puente (regla solo mar/mié y mié/jue).
    expect(chileanHolidaysForYear(2025).has('2025-09-20')).toBe(false);
  });

  it('excluye fines de semana y feriados de días hábiles', () => {
    // Sábado y domingo aunque no sean feriado.
    expect(isBusinessDateKey('2026-09-19')).toBe(false);
    expect(isBusinessDateKey('2026-09-20')).toBe(false);
    // Viernes 18 es feriado.
    expect(isBusinessDateKey('2026-09-18')).toBe(false);
    // Lunes hábil normal.
    expect(isBusinessDateKey('2026-09-14')).toBe(true);
  });
});
