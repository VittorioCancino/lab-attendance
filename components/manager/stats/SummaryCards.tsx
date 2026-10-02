import type { MonthSummary } from '@/lib/db/attendance-stats';

function formatHours(hours: number): string {
  return `${hours.toLocaleString('es-CL', { maximumFractionDigits: 1, minimumFractionDigits: 0 })} h`;
}

function formatAvgStay(minutes: number): string {
  if (minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${String(rest)} min`;
  return `${String(hours)} h ${String(rest)} min`;
}

export function SummaryCards({ summary }: { summary: MonthSummary }) {
  const occupancyText =
    summary.occupancyRate === null
      ? 'Sin capacidad configurada'
      : `${(summary.occupancyRate * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`;
  const cards = [
    {
      hint: `${formatHours(summary.hoursUsed)} de ${summary.hoursAvailable === null ? '—' : formatHours(summary.hoursAvailable)} disponibles · ${String(summary.businessDaysTotal)} días hábiles`,
      label: 'Ocupación promedio del mes',
      value: occupancyText,
    },
    {
      hint: `${summary.entriesTotal.toLocaleString('es-CL')} entradas en ${String(summary.businessDays)} días hábiles`,
      label: 'Entradas promedio por día',
      value: summary.avgEntriesPerOpenDay.toLocaleString('es-CL', {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }),
    },
    {
      hint: `${summary.personDays.toLocaleString('es-CL')} personas-día`,
      label: 'Estadía promedio por persona y día',
      value: formatAvgStay(summary.avgStayMinutesPerPersonDay),
    },
    {
      hint: 'Cuentas ATTENDEE del laboratorio',
      label: 'Usuarios registrados',
      value: summary.registeredUsers.toLocaleString('es-CL'),
    },
  ];

  return (
    <dl className="grid border-y border-slate-300 bg-white sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <div
          key={card.label}
          className={`p-6 ${index < cards.length - 1 ? 'border-b border-slate-200 sm:border-r sm:border-b-0 lg:border-r' : ''} ${index % 2 === 0 ? '' : ''}`}
        >
          <dt className="text-sm font-medium text-slate-500">{card.label}</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {card.value}
          </dd>
          <dd className="mt-2 text-xs leading-5 text-slate-500">{card.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
