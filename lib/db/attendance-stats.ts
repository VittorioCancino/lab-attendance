import 'server-only';

import type { PrismaClient } from '@/app/generated/prisma/client';
import { reconcileLabAttendance } from '@/lib/db/attendance-policy';
import { isChileanHoliday } from '@/lib/holidays/chile';

/* ------------------------------------------------------------------ */
/* Timezone helpers (puros y testeables)                               */
/* ------------------------------------------------------------------ */

export interface TzParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
}

const tzFormatCache = new Map<string, Intl.DateTimeFormat>();

function tzFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = tzFormatCache.get(timezone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  });
  tzFormatCache.set(timezone, formatter);
  return formatter;
}

export function getTzParts(date: Date, timezone: string): TzParts {
  const parts = tzFormatter(timezone).formatToParts(date);
  const get = (type: string): number => {
    const part = parts.find((entry) => entry.type === type);
    if (!part) throw new Error(`Missing ${type} in tz parts.`);
    return Number(part.value);
  };
  const hour = get('hour') % 24;
  return {
    day: get('day'),
    hour,
    minute: get('minute'),
    month: get('month'),
    year: get('year'),
  };
}

export function toDateKey(date: Date, timezone: string): string {
  const parts = getTzParts(date, timezone);
  return `${String(parts.year)}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Offset en ms tal que wallTime(tz) = utc + offset. */
function getTimeZoneOffsetMs(utcDate: Date, timezone: string): number {
  const parts = getTzParts(utcDate, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    utcDate.getUTCSeconds(),
    utcDate.getUTCMilliseconds(),
  );
  return asUtc - utcDate.getTime();
}

/** Convierte una hora mural en `timezone` a instante UTC. Itera 2 veces por DST. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(guess), timezone);
    guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset;
  }
  return new Date(guess);
}

export function getMonthBounds(
  monthKey: string,
  timezone: string,
): { end: Date; start: Date } {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  const start = zonedTimeToUtc(year, month, 1, 0, 0, timezone);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = zonedTimeToUtc(nextYear, nextMonth, 1, 0, 0, timezone);
  return { end, start };
}

export function getDayBounds(
  dayKey: string,
  timezone: string,
): { end: Date; start: Date } {
  const [year, month, day] = dayKey.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const start = zonedTimeToUtc(year, month, day, 0, 0, timezone);
  const nextKey = addOneDayKey(dayKey);
  const [ny, nm, nd] = nextKey.split('-').map(Number) as [number, number, number];
  return {
    end: zonedTimeToUtc(ny, nm, nd, 0, 0, timezone),
    start,
  };
}

/** Suma 1 día calendario a un dateKey YYYY-MM-DD (aritmética UTC pura). */
function addOneDayKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${String(next.getUTCFullYear())}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

export function daysInMonthKey(monthKey: string): string[] {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const keys: string[] = [];
  for (let day = 1; day <= days; day += 1) {
    keys.push(`${String(year)}-${pad2(month)}-${pad2(day)}`);
  }
  return keys;
}

export function isBusinessDateKey(dateKey: string): boolean {
  const [year, month, day] = dateKey.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !isChileanHoliday(dateKey);
}

export function businessDaysInMonth(monthKey: string): string[] {
  return daysInMonthKey(monthKey).filter(isBusinessDateKey);
}

export function currentMonthKey(now: Date, timezone: string): string {
  return toDateKey(now, timezone).slice(0, 7);
}

export function currentDayKey(now: Date, timezone: string): string {
  return toDateKey(now, timezone);
}

/* ------------------------------------------------------------------ */
/* Tipos de estadísticas                                               */
/* ------------------------------------------------------------------ */

export interface StatsLab {
  attendanceClosesAtMinute: number;
  attendanceOpensAtMinute: number;
  id: string;
  maxOccupancy: number | null;
  name: string;
  slug: string;
  timezone: string;
}

export interface PresentNowEntry {
  checkedInAt: Date;
  checkInMethod: 'QR' | 'MANAGER' | 'SYSTEM';
  email: string;
  minutesPresent: number;
  name: string;
  userId: string;
  visitId: string;
}

export interface MonthSummary {
  avgEntriesPerOpenDay: number;
  avgStayMinutesPerPersonDay: number;
  businessDays: number;
  businessDaysTotal: number;
  entriesTotal: number;
  hoursAvailable: number | null;
  hoursUsed: number;
  monthKey: string;
  occupancyRate: number | null;
  openHours: number;
  personDays: number;
  registeredUsers: number;
}

export interface HourlyPoint {
  hourLabel: string;
  hourStartMinute: number;
  occupancy: number;
}

export interface DayEntriesPoint {
  dateKey: string;
  day: number;
  entries: number;
  isBusinessDay: boolean;
}

export interface TopUserEntry {
  email: string;
  name: string;
  totalMinutes: number;
  userId: string;
  visitCount: number;
}

interface VisitRow {
  checkedInAt: Date;
  checkedOutAt: Date | null;
  userId: string;
}

/* ------------------------------------------------------------------ */
/* Carga base                                                          */
/* ------------------------------------------------------------------ */

export async function getStatsLab(
  client: PrismaClient,
  labId: string,
): Promise<StatsLab | null> {
  const lab = await client.lab.findUnique({
    where: { id: labId },
    select: {
      attendanceClosesAtMinute: true,
      attendanceOpensAtMinute: true,
      id: true,
      isActive: true,
      maxOccupancy: true,
      name: true,
      slug: true,
      timezone: true,
    },
  });
  if (lab === null || !lab.isActive) return null;
  return lab;
}

async function loadVisitsOverlapping(
  client: PrismaClient,
  labId: string,
  start: Date,
  end: Date,
): Promise<VisitRow[]> {
  return client.attendanceVisit.findMany({
    where: {
      labId,
      checkedInAt: { lt: end },
      OR: [{ checkedOutAt: null }, { checkedOutAt: { gt: start } }],
      membership: { role: 'ATTENDEE' },
    },
    select: { checkedInAt: true, checkedOutAt: true, userId: true },
    orderBy: [{ checkedInAt: 'asc' }],
  });
}

async function loadUserDirectory(
  client: PrismaClient,
  labId: string,
): Promise<{
  count: number;
  byUserId: Map<string, { email: string; name: string }>;
}> {
  const memberships = await client.labMembership.findMany({
    where: { labId, role: 'ATTENDEE' },
    select: { user: { select: { email: true, name: true } }, userId: true },
  });
  return {
    byUserId: new Map(
      memberships.map((membership) => [
        membership.userId,
        { email: membership.user.email, name: membership.user.name },
      ]),
    ),
    count: memberships.length,
  };
}

/** Intersección en minutos entre [visitStart, visitEnd] y [clipStart, clipEnd). */
export function overlapMinutes(
  visitStart: Date,
  visitEnd: Date,
  clipStart: Date,
  clipEnd: Date,
): number {
  const start = Math.max(visitStart.getTime(), clipStart.getTime());
  const end = Math.min(visitEnd.getTime(), clipEnd.getTime());
  return Math.max(0, Math.floor((end - start) / 60_000));
}

/* ------------------------------------------------------------------ */
/* 0. Presentes ahora                                                  */
/* ------------------------------------------------------------------ */

export async function getPresentNow(
  client: PrismaClient,
  labId: string,
  now?: Date,
): Promise<{ entries: PresentNowEntry[]; lab: StatsLab; readAt: Date }> {
  const policy = await reconcileLabAttendance(client, { labId, now });
  if (policy === null) throw new Error('The configured lab is not available.');
  const lab = await getStatsLab(client, labId);
  if (lab === null) throw new Error('The configured lab is not available.');

  const readAt = policy.now;
  const visits = await client.attendanceVisit.findMany({
    where: {
      checkedOutAt: null,
      labId,
      membership: { role: 'ATTENDEE' },
    },
    select: {
      checkInMethod: true,
      checkedInAt: true,
      id: true,
      membership: { select: { user: { select: { email: true, name: true } }, userId: true } },
    },
    orderBy: [{ checkedInAt: 'asc' }],
  });

  const entries: PresentNowEntry[] = visits.map((visit) => ({
    checkedInAt: visit.checkedInAt,
    checkInMethod: visit.checkInMethod,
    email: visit.membership.user.email,
    minutesPresent: Math.max(
      0,
      Math.floor((readAt.getTime() - visit.checkedInAt.getTime()) / 60_000),
    ),
    name: visit.membership.user.name,
    userId: visit.membership.userId,
    visitId: visit.id,
  }));

  entries.sort((a, b) => b.minutesPresent - a.minutesPresent);

  return { entries, lab, readAt };
}

/* ------------------------------------------------------------------ */
/* 2. Resumen del mes                                                  */
/* ------------------------------------------------------------------ */

export async function getMonthSummary(
  client: PrismaClient,
  labId: string,
  monthKey: string,
  now?: Date,
): Promise<{ lab: StatsLab; summary: MonthSummary }> {
  await reconcileLabAttendance(client, { labId, now });
  const lab = await getStatsLab(client, labId);
  if (lab === null) throw new Error('The configured lab is not available.');

  const effectiveNow = now ?? new Date();
  const { end: monthEnd, start: monthStart } = getMonthBounds(
    monthKey,
    lab.timezone,
  );
  const businessKeys = businessDaysInMonth(monthKey);
  const businessDaysTotal = businessKeys.length;
  // Días hábiles transcurridos (para promedios parciales del mes en curso).
  const todayKey = toDateKey(effectiveNow, lab.timezone);
  const businessDays =
    monthKey === currentMonthKey(effectiveNow, lab.timezone)
      ? businessKeys.filter((key) => key <= todayKey).length
      : businessDaysTotal;

  const openMinutesPerDay =
    lab.attendanceClosesAtMinute - lab.attendanceOpensAtMinute;
  const openHours = (businessDaysTotal * openMinutesPerDay) / 60;
  const hoursAvailable =
    lab.maxOccupancy === null ? null : (lab.maxOccupancy * openHours);

  const visits = await loadVisitsOverlapping(client, labId, monthStart, monthEnd);
  const directory = await loadUserDirectory(client, labId);

  let usedMinutes = 0;
  let entriesTotal = 0;
  const minutesByPersonDay = new Map<string, number>();

  for (const visit of visits) {
    if (visit.checkedInAt >= monthStart && visit.checkedInAt < monthEnd) {
      entriesTotal += 1;
    }
    const visitEnd =
      visit.checkedOutAt === null || visit.checkedOutAt > effectiveNow
        ? effectiveNow
        : visit.checkedOutAt;
    // Recorta al mes y al pasado (no contar futuro por relojes adelantados).
    const clippedEnd = visitEnd > monthEnd ? monthEnd : visitEnd;
    const minutes = overlapMinutes(
      visit.checkedInAt,
      clippedEnd,
      monthStart,
      monthEnd,
    );
    usedMinutes += minutes;

    if (minutes > 0) {
      // Atribuye al día (tz lab) del check-in para el promedio persona-día.
      const dayKey = toDateKey(
        visit.checkedInAt < monthStart ? monthStart : visit.checkedInAt,
        lab.timezone,
      );
      const key = `${visit.userId}|${dayKey}`;
      minutesByPersonDay.set(key, (minutesByPersonDay.get(key) ?? 0) + minutes);
    }
  }

  const hoursUsed = usedMinutes / 60;
  const personDays = minutesByPersonDay.size;
  const totalPersonDayMinutes = [...minutesByPersonDay.values()].reduce(
    (acc, value) => acc + value,
    0,
  );

  return {
    lab,
    summary: {
      avgEntriesPerOpenDay:
        businessDays === 0 ? 0 : entriesTotal / businessDays,
      avgStayMinutesPerPersonDay:
        personDays === 0 ? 0 : totalPersonDayMinutes / personDays,
      businessDays,
      businessDaysTotal,
      entriesTotal,
      hoursAvailable,
      hoursUsed,
      monthKey,
      occupancyRate:
        hoursAvailable === null || hoursAvailable === 0
          ? null
          : hoursUsed / hoursAvailable,
      openHours,
      personDays,
      registeredUsers: directory.count,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 3. Uso por hora de un día (máximo por bloque [h:00, h+1h))          */
/* ------------------------------------------------------------------ */

export async function getHourlyMaxForDay(
  client: PrismaClient,
  labId: string,
  dayKey: string,
  now?: Date,
): Promise<{ lab: StatsLab; points: HourlyPoint[] }> {
  await reconcileLabAttendance(client, { labId, now });
  const lab = await getStatsLab(client, labId);
  if (lab === null) throw new Error('The configured lab is not available.');

  const effectiveNow = now ?? new Date();
  const [year, month, day] = dayKey.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const dayStart = zonedTimeToUtc(year, month, day, 0, 0, lab.timezone);
  const dayEnd = zonedTimeToUtc(year, month, day, 23, 59, lab.timezone);
  dayEnd.setTime(dayEnd.getTime() + 60_000);

  const visits = await loadVisitsOverlapping(client, labId, dayStart, dayEnd);

  const points: HourlyPoint[] = [];
  const opensHour = Math.floor(lab.attendanceOpensAtMinute / 60);
  const closesHour = Math.ceil(lab.attendanceClosesAtMinute / 60);

  for (let hour = opensHour; hour < closesHour; hour += 1) {
    const bucketStart = zonedTimeToUtc(year, month, day, hour, 0, lab.timezone);
    const bucketEnd = new Date(bucketStart.getTime() + 3_600_000);
    let occupancy = 0;
    for (const visit of visits) {
      const visitEnd =
        visit.checkedOutAt === null || visit.checkedOutAt > effectiveNow
          ? effectiveNow
          : visit.checkedOutAt;
      if (visit.checkedInAt < bucketEnd && visitEnd > bucketStart) {
        occupancy += 1;
      }
    }
    points.push({
      hourLabel: `${pad2(hour)}:00`,
      hourStartMinute: hour * 60,
      occupancy,
    });
  }

  return { lab, points };
}

/* ------------------------------------------------------------------ */
/* 4. Uso por hora promedio (mes o histórico, solo días hábiles)       */
/* ------------------------------------------------------------------ */

export async function getHourlyAverage(
  client: PrismaClient,
  labId: string,
  period: { monthKey?: string; scope: 'month' | 'history' },
  now?: Date,
): Promise<{ businessDays: number; lab: StatsLab; points: HourlyPoint[] }> {
  await reconcileLabAttendance(client, { labId, now });
  const lab = await getStatsLab(client, labId);
  if (lab === null) throw new Error('The configured lab is not available.');
  const effectiveNow = now ?? new Date();

  let rangeStart: Date;
  let rangeEnd: Date = effectiveNow;
  let businessKeys: string[];

  if (period.scope === 'month') {
    if (!period.monthKey) throw new Error('monthKey is required.');
    const bounds = getMonthBounds(period.monthKey, lab.timezone);
    rangeStart = bounds.start;
    rangeEnd = bounds.end < effectiveNow ? bounds.end : effectiveNow;
    businessKeys = businessDaysInMonth(period.monthKey).filter(
      (key) =>
        period.monthKey !== currentMonthKey(effectiveNow, lab.timezone) ||
        key <= toDateKey(effectiveNow, lab.timezone),
    );
  } else {
    const earliest = await client.attendanceVisit.findFirst({
      where: { labId },
      select: { checkedInAt: true },
      orderBy: [{ checkedInAt: 'asc' }],
    });
    const startKey = earliest
      ? toDateKey(earliest.checkedInAt, lab.timezone)
      : toDateKey(effectiveNow, lab.timezone);
    const [sy, sm, sd] = startKey.split('-').map(Number) as [number, number, number];
    rangeStart = zonedTimeToUtc(sy, sm, sd, 0, 0, lab.timezone);
    businessKeys = enumerateBusinessKeysBetween(startKey, toDateKey(effectiveNow, lab.timezone));
  }

  const visits = await loadVisitsOverlapping(client, labId, rangeStart, rangeEnd);

  const opensHour = Math.floor(lab.attendanceOpensAtMinute / 60);
  const closesHour = Math.ceil(lab.attendanceClosesAtMinute / 60);
  const totals = new Map<number, number>();
  for (let hour = opensHour; hour < closesHour; hour += 1) totals.set(hour, 0);

  for (const dayKey of businessKeys) {
    const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
    for (let hour = opensHour; hour < closesHour; hour += 1) {
      const bucketStart = zonedTimeToUtc(year, month, day, hour, 0, lab.timezone);
      const bucketEnd = new Date(bucketStart.getTime() + 3_600_000);
      if (bucketStart >= rangeEnd || bucketEnd <= rangeStart) continue;
      let occupancy = 0;
      for (const visit of visits) {
        const visitEnd =
          visit.checkedOutAt === null || visit.checkedOutAt > effectiveNow
            ? effectiveNow
            : visit.checkedOutAt;
        if (visit.checkedInAt < bucketEnd && visitEnd > bucketStart) occupancy += 1;
      }
      totals.set(hour, (totals.get(hour) ?? 0) + occupancy);
    }
  }

  const divisor = Math.max(1, businessKeys.length);
  const points: HourlyPoint[] = [...totals.entries()].map(([hour, total]) => ({
    hourLabel: `${pad2(hour)}:00`,
    hourStartMinute: hour * 60,
    occupancy: total / divisor,
  }));

  return { businessDays: businessKeys.length, lab, points };
}

function enumerateBusinessKeysBetween(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  let cursor = startKey;
  let guard = 0;
  while (cursor <= endKey && guard < 4000) {
    if (isBusinessDateKey(cursor)) keys.push(cursor);
    cursor = addOneDayKey(cursor);
    guard += 1;
  }
  return keys;
}

/* ------------------------------------------------------------------ */
/* 5. Entradas por día del mes                                         */
/* ------------------------------------------------------------------ */

export async function getEntriesByDay(
  client: PrismaClient,
  labId: string,
  monthKey: string,
  now?: Date,
): Promise<{ lab: StatsLab; points: DayEntriesPoint[] }> {
  await reconcileLabAttendance(client, { labId, now });
  const lab = await getStatsLab(client, labId);
  if (lab === null) throw new Error('The configured lab is not available.');

  const { end: monthEnd, start: monthStart } = getMonthBounds(monthKey, lab.timezone);
  const visits = await client.attendanceVisit.findMany({
    where: {
      labId,
      checkedInAt: { gte: monthStart, lt: monthEnd },
      membership: { role: 'ATTENDEE' },
    },
    select: { checkedInAt: true },
  });

  const counts = new Map<string, number>();
  for (const visit of visits) {
    const key = toDateKey(visit.checkedInAt, lab.timezone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: DayEntriesPoint[] = daysInMonthKey(monthKey).map((dateKey) => {
    const day = Number(dateKey.slice(8, 10));
    return {
      dateKey,
      day,
      entries: counts.get(dateKey) ?? 0,
      isBusinessDay: isBusinessDateKey(dateKey),
    };
  });

  return { lab, points };
}

/* ------------------------------------------------------------------ */
/* 6. Top por tiempo acumulado                                         */
/* ------------------------------------------------------------------ */

export async function getTopUsersByTime(
  client: PrismaClient,
  labId: string,
  period: { monthKey?: string; scope: 'month' | 'history' },
  now?: Date,
): Promise<{ entries: TopUserEntry[]; lab: StatsLab }> {
  await reconcileLabAttendance(client, { labId, now });
  const lab = await getStatsLab(client, labId);
  if (lab === null) throw new Error('The configured lab is not available.');
  const effectiveNow = now ?? new Date();

  let rangeStart: Date;
  let rangeEnd: Date;
  if (period.scope === 'month') {
    if (!period.monthKey) throw new Error('monthKey is required.');
    const bounds = getMonthBounds(period.monthKey, lab.timezone);
    rangeStart = bounds.start;
    rangeEnd = bounds.end;
  } else {
    rangeStart = new Date(0);
    rangeEnd = effectiveNow;
  }

  const visits = await loadVisitsOverlapping(client, labId, rangeStart, rangeEnd);
  const directory = await loadUserDirectory(client, labId);

  const totals = new Map<string, { minutes: number; visits: number }>();
  for (const visit of visits) {
    const visitEnd =
      visit.checkedOutAt === null || visit.checkedOutAt > effectiveNow
        ? effectiveNow
        : visit.checkedOutAt;
    const minutes = overlapMinutes(visit.checkedInAt, visitEnd, rangeStart, rangeEnd);
    if (minutes <= 0) continue;
    const current = totals.get(visit.userId) ?? { minutes: 0, visits: 0 };
    current.minutes += minutes;
    current.visits += 1;
    totals.set(visit.userId, current);
  }

  const entries: TopUserEntry[] = [...totals.entries()]
    .map(([userId, total]) => ({
      email: directory.byUserId.get(userId)?.email ?? 'No disponible',
      name: directory.byUserId.get(userId)?.name ?? 'Usuario retirado',
      totalMinutes: total.minutes,
      userId,
      visitCount: total.visits,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.name.localeCompare('es-CL'));

  return { entries, lab };
}
