/**
 * Feriados nacionales de Chile para el cálculo de días hábiles.
 *
 * Fuente legal: Ley 19.973 y modificatorias (feriados irrenunciables incluidos
 * como días no hábiles para este cómputo). Los días de apertura del laboratorio
 * excluyen sábados, domingos y los feriados listados aquí.
 *
 * Cobertura: años 2024-2030 con reglas de traslado y puentes de septiembre.
 * Para años fuera de rango se aplican solo los feriados fijos + Semana Santa
 * calculada con el algoritmo de Meeus (válido para el calendario gregoriano).
 */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toKey(year: number, month: number, day: number): string {
  return `${String(year)}-${pad2(month)}-${pad2(day)}`;
}

/** Viernes Santo y Sábado Santo vía cómputo de Pascua (algoritmo de Meeus). */
function easterRelatedHolidays(year: number): string[] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;

  const easter = new Date(Date.UTC(year, easterMonth - 1, easterDay));
  const friday = new Date(easter);
  friday.setUTCDate(easter.getUTCDate() - 2);
  const saturday = new Date(easter);
  saturday.setUTCDate(easter.getUTCDate() - 1);

  return [
    toKey(
      friday.getUTCFullYear(),
      friday.getUTCMonth() + 1,
      friday.getUTCDate(),
    ),
    toKey(
      saturday.getUTCFullYear(),
      saturday.getUTCMonth() + 1,
      saturday.getUTCDate(),
    ),
  ];
}

function mondayized(year: number, month: number, day: number): string {
  // Feriados trasladables: si caen mar/mié/jue se mueven al lunes anterior,
  // si caen vie se mueven al lunes siguiente (regla chilena habitual).
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay(); // 0=dom .. 6=sáb
  if (dow >= 2 && dow <= 4) {
    date.setUTCDate(date.getUTCDate() - (dow - 1));
  } else if (dow === 5) {
    date.setUTCDate(date.getUTCDate() + 3);
  }
  return toKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Puentes de Fiestas Patrias:
 * - Si 18 y 19 son mar/mié de un mismo año, el lunes 17 es feriado.
 * - Si 18 y 19 son mié/jue, el viernes 20 es feriado.
 */
function septemberBridges(year: number): string[] {
  const dow18 = new Date(Date.UTC(year, 8, 18)).getUTCDay();
  const dow19 = new Date(Date.UTC(year, 8, 19)).getUTCDay();
  if (dow18 === 2 && dow19 === 3) {
    return [toKey(year, 9, 17)];
  }
  if (dow18 === 3 && dow19 === 4) {
    return [toKey(year, 9, 20)];
  }
  return [];
}

export function chileanHolidaysForYear(year: number): Set<string> {
  const holidays = new Set<string>([
    toKey(year, 1, 1), // Año Nuevo (irrenunciable)
    toKey(year, 5, 1), // Día del Trabajo (irrenunciable)
    toKey(year, 5, 21), // Glorias Navales
    toKey(year, 6, 21), // Día Nacional de los Pueblos Indígenas (solsticio; se aproxima al 21)
    toKey(year, 7, 16), // Virgen del Carmen
    toKey(year, 8, 15), // Asunción de la Virgen
    toKey(year, 9, 18), // Independencia (irrenunciable)
    toKey(year, 9, 19), // Glorias del Ejército (irrenunciable)
    toKey(year, 10, 31), // Día de las Iglesias Evangélicas
    toKey(year, 11, 1), // Todos los Santos
    toKey(year, 12, 8), // Inmaculada Concepción
    toKey(year, 12, 25), // Navidad (irrenunciable)
    mondayized(year, 6, 29), // San Pedro y San Pablo (trasladable)
    mondayized(year, 10, 12), // Encuentro de Dos Mundos (trasladable)
  ]);

  for (const key of easterRelatedHolidays(year)) {
    holidays.add(key);
  }
  for (const key of septemberBridges(year)) {
    holidays.add(key);
  }

  return holidays;
}

export function isChileanHoliday(dateKey: string): boolean {
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isInteger(year)) {
    return false;
  }
  return chileanHolidaysForYear(year).has(dateKey);
}

/** Lunes a viernes que no sea feriado chileno. `dateKey` en formato YYYY-MM-DD. */
export function isBusinessDay(dateKey: string, utcDate: Date): boolean {
  const dow = utcDate.getUTCDay();
  if (dow === 0 || dow === 6) {
    return false;
  }
  return !isChileanHoliday(dateKey);
}
