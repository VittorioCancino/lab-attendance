import type { PresentNowEntry } from '@/lib/db/attendance-stats';

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${String(minutes)} min`;
  return minutes === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(minutes)} min`;
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

function methodLabel(method: PresentNowEntry['checkInMethod']): string {
  if (method === 'QR') return 'Código QR';
  if (method === 'MANAGER') return 'Registro manual';
  return 'Sistema';
}

export function PresentList({
  entries,
  timezone,
}: {
  entries: PresentNowEntry[];
  timezone: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
        No hay personas presentes en este momento.
      </p>
    );
  }

  return (
    <div
      role="region"
      aria-label="Personas presentes"
      tabIndex={0}
      className="overflow-x-auto"
    >
      <table className="w-full min-w-[36rem] border-collapse bg-white text-left text-sm">
        <caption className="sr-only">
          Personas presentes ordenadas de mayor a menor permanencia
        </caption>
        <thead>
          <tr className="border-b border-slate-200 text-xs tracking-wider text-slate-500 uppercase">
            <th scope="col" className="px-4 py-3">
              Persona
            </th>
            <th scope="col" className="px-4 py-3">
              Entrada
            </th>
            <th scope="col" className="px-4 py-3">
              Lleva
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.visitId} className="border-b border-slate-100">
              <td className="px-4 py-3">
                <p className="font-semibold text-slate-950">{entry.name}</p>
                <p className="text-xs text-slate-500">{entry.email}</p>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {formatTime(entry.checkedInAt, timezone)}{' '}
                <span className="text-xs text-slate-500">
                  ({methodLabel(entry.checkInMethod)})
                </span>
              </td>
              <td className="px-4 py-3 font-mono font-semibold text-slate-950">
                {formatDuration(entry.minutesPresent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
