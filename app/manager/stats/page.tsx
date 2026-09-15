import type { Metadata } from 'next';

import { requireLabManager } from '@/lib/auth/require-lab-manager';
import { prisma } from '@/lib/db/prisma';
import {
  currentDayKey,
  currentMonthKey,
  getEntriesByDay,
  getHourlyAverage,
  getHourlyMaxForDay,
  getMonthSummary,
  getPresentNow,
  getTopUsersByTime,
} from '@/lib/db/attendance-stats';
import {
  statsDaySchema,
  statsMonthSchema,
  statsNoticeSchema,
  statsPeriodSchema,
} from '@/lib/types/stats.types';
import { CapacityForm } from '@/components/manager/stats/CapacityForm';
import { PresentList } from '@/components/manager/stats/PresentList';
import { StatsFilters } from '@/components/manager/stats/StatsFilters';
import { SummaryCards } from '@/components/manager/stats/SummaryCards';
import { TopUsers } from '@/components/manager/stats/TopUsers';
import { CapacityBarClient } from '@/components/manager/stats/charts/CapacityBarClient';
import { EntriesByDayChartClient } from '@/components/manager/stats/charts/EntriesByDayChartClient';
import { HourlyLineChartClient } from '@/components/manager/stats/charts/HourlyLineChartClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Estadísticas | Administración local',
  description:
    'Ocupación actual, resúmenes mensuales y uso por hora del laboratorio.',
};

function getNoticeMessage(
  notice: 'capacity-updated' | 'capacity-changed' | 'capacity-invalid',
): string {
  if (notice === 'capacity-updated') return 'La capacidad fue actualizada.';
  return 'La capacidad cambió mientras completaba el formulario. Revise el valor actual.';
}

function sectionShell(
  eyebrow: string,
  title: string,
  description: string,
  children: React.ReactNode,
  id: string,
) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-6 gap-5"
    >
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-teal-800 uppercase">
          {eyebrow}
        </p>
        <h2
          id={`${id}-title`}
          className="mt-2 text-2xl font-semibold tracking-tight text-slate-950"
        >
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

export default async function ManagerStatsPage({
  searchParams,
}: {
  searchParams: Promise<{
    avgScope?: string | string[];
    day?: string | string[];
    month?: string | string[];
    notice?: string | string[];
    topScope?: string | string[];
  }>;
}) {
  const context = await requireLabManager();
  const query = await searchParams;

  const now = new Date();
  const fallbackMonth = currentMonthKey(now, context.lab.timezone);
  const fallbackDay = currentDayKey(now, context.lab.timezone);

  const monthKey = statsMonthSchema.safeParse(
    typeof query.month === 'string' ? query.month : undefined,
  ).success
    ? (query.month as string)
    : fallbackMonth;
  const dayKey = statsDaySchema.safeParse(
    typeof query.day === 'string' ? query.day : undefined,
  ).success
    ? (query.day as string)
    : fallbackDay;
  const avgScope = statsPeriodSchema.safeParse(
    typeof query.avgScope === 'string' ? query.avgScope : undefined,
  ).success
    ? (query.avgScope as 'month' | 'history')
    : 'month';
  const topScope = statsPeriodSchema.safeParse(
    typeof query.topScope === 'string' ? query.topScope : undefined,
  ).success
    ? (query.topScope as 'month' | 'history')
    : 'month';
  const notice = statsNoticeSchema.safeParse(
    typeof query.notice === 'string' ? query.notice : undefined,
  );

  const [present, month, hourlyDay, hourlyAvg, entries, top] =
    await Promise.all([
      getPresentNow(prisma, context.lab.id, now),
      getMonthSummary(prisma, context.lab.id, monthKey, now),
      getHourlyMaxForDay(prisma, context.lab.id, dayKey, now),
      getHourlyAverage(
        prisma,
        context.lab.id,
        avgScope === 'month'
          ? { monthKey, scope: 'month' }
          : { scope: 'history' },
        now,
      ),
      getEntriesByDay(prisma, context.lab.id, monthKey, now),
      getTopUsersByTime(
        prisma,
        context.lab.id,
        topScope === 'month'
          ? { monthKey, scope: 'month' }
          : { scope: 'history' },
        now,
      ),
    ]);

  const capacity = present.lab.maxOccupancy;
  const occupancyRate =
    capacity === null || capacity === 0
      ? null
      : present.entries.length / capacity;

  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-5 py-10 sm:px-8 sm:py-14">
      <header className="grid gap-6">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px w-10 bg-teal-700" />
            <p className="text-xs font-bold tracking-[0.22em] text-teal-800 uppercase">
              Estadísticas del laboratorio
            </p>
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Uso y permanencia en {present.lab.name}
          </h1>
          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            Los días hábiles excluyen sábados, domingos y feriados chilenos. El
            horario cubierto es el configurado para la instancia en{' '}
            {present.lab.timezone}.
          </p>
        </div>
        <div aria-live="polite" role="status">
          {notice.success ? (
            <p className="border-l-4 border-teal-600 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-950">
              {getNoticeMessage(notice.data)}
            </p>
          ) : null}
        </div>
        <StatsFilters
          avgScope={avgScope}
          day={dayKey}
          month={monthKey}
          topScope={topScope}
        />
      </header>

      {sectionShell(
        'Ahora mismo',
        'Personas presentes',
        'Ordenadas de mayor a menor tiempo de permanencia en curso.',
        <PresentList
          entries={present.entries}
          timezone={present.lab.timezone}
        />,
        'presentes',
      )}

      {sectionShell(
        'Carga actual',
        'Capacidad en uso',
        capacity === null
          ? 'Configure la capacidad máxima para ver la barra de carga y el porcentaje de ocupación.'
          : `${present.entries.length.toLocaleString('es-CL')} presentes de ${capacity.toLocaleString('es-CL')} cupos (${((occupancyRate ?? 0) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} %).`,
        capacity === null ? (
          <p className="border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            Sin capacidad configurada. Guárdela abajo para activar este gráfico.
          </p>
        ) : (
          <div className="border border-slate-200 bg-white p-5">
            <CapacityBarClient
              present={present.entries.length}
              capacity={capacity}
            />
          </div>
        ),
        'capacidad',
      )}

      {sectionShell(
        `Resumen · ${month.summary.monthKey}`,
        'Ocupación y promedios del mes',
        `Disponible = capacidad × horas hábiles (${String(month.summary.businessDaysTotal)} días hábiles × horario configurado). Cambie el mes en los filtros.`,
        <SummaryCards summary={month.summary} />,
        'resumen',
      )}

      {sectionShell(
        `Por hora · ${dayKey}`,
        'Uso por hora del día',
        'Máxima ocupación simultánea en cada bloque [h:00, h+1h). Cubre solo el horario habilitado.',
        hourlyDay.points.length === 0 ? (
          <p className="border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            Sin horario habilitado para mostrar.
          </p>
        ) : (
          <div className="border border-slate-200 bg-white p-5">
            <HourlyLineChartClient
              ariaLabel={`Uso por hora del ${dayKey}`}
              data={hourlyDay.points.map((point) => ({
                hourLabel: point.hourLabel,
                occupancy: point.occupancy,
              }))}
            />
          </div>
        ),
        'uso-diario',
      )}

      {sectionShell(
        avgScope === 'month'
          ? `Promedio · ${monthKey}`
          : 'Promedio · histórico',
        'Uso por hora en promedio',
        avgScope === 'month'
          ? `Promedio de la ocupación máxima de cada bloque sobre ${String(hourlyAvg.businessDays)} días hábiles del mes.`
          : `Promedio sobre ${String(hourlyAvg.businessDays)} días hábiles con historia.`,
        <div className="border border-slate-200 bg-white p-5">
          <HourlyLineChartClient
            ariaLabel="Uso por hora en promedio"
            data={hourlyAvg.points.map((point) => ({
              hourLabel: point.hourLabel,
              occupancy: Math.round(point.occupancy * 100) / 100,
            }))}
          />
        </div>,
        'uso-promedio',
      )}

      {sectionShell(
        `Entradas · ${monthKey}`,
        'Entradas por día del mes',
        'Conteo de check-ins por día calendario (los días no hábiles se marcan con fondo distinto en la tabla de apoyo).',
        <div className="border border-slate-200 bg-white p-5">
          <EntriesByDayChartClient
            data={entries.points.map((point) => ({
              day: point.day,
              entries: point.entries,
            }))}
          />
        </div>,
        'entradas',
      )}

      {sectionShell(
        topScope === 'month' ? `Ranking · ${monthKey}` : 'Ranking · histórico',
        'Quiénes más permanecen',
        'Tiempo total acumulado en el periodo. El podio destaca el top 5.',
        <TopUsers entries={top.entries} />,
        'ranking',
      )}

      {sectionShell(
        'Configuración',
        'Capacidad máxima',
        'Control optimista: si otro manager la cambia en paralelo deberá reintentar.',
        <div className="max-w-xl border border-slate-200 bg-white p-5">
          <CapacityForm maxOccupancy={capacity} />
        </div>,
        'capacidad-config',
      )}
    </div>
  );
}
