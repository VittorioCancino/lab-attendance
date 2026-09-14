import type { TopUserEntry } from '@/lib/db/attendance-stats';

function formatTotal(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(rest)} min`;
}

const podiumStyles = [
  'border-amber-400 bg-amber-50',
  'border-slate-300 bg-slate-50',
  'border-orange-300 bg-orange-50',
  'border-teal-200 bg-white',
  'border-teal-200 bg-white',
];

const podiumMedals = ['🥇', '🥈', '🥉', '4.º', '5.º'];

export function TopUsers({ entries }: { entries: TopUserEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
        Aún no hay permanencias registradas en el periodo seleccionado.
      </p>
    );
  }

  const topFive = entries.slice(0, 5);
  const rest = entries.slice(5);

  return (
    <div className="grid gap-4">
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {topFive.map((entry, index) => (
          <li
            key={entry.userId}
            className={`border-t-4 p-4 ${podiumStyles[index] ?? 'border-teal-200 bg-white'}`}
          >
            <p className="text-sm font-bold text-slate-500">
              {podiumMedals[index] ?? `${String(index + 1)}.º`}
            </p>
            <p
              className="mt-2 truncate font-semibold text-slate-950"
              title={entry.name}
            >
              {entry.name}
            </p>
            <p className="truncate text-xs text-slate-500" title={entry.email}>
              {entry.email}
            </p>
            <p className="mt-3 font-mono text-lg font-semibold text-slate-950">
              {formatTotal(entry.totalMinutes)}
            </p>
            <p className="text-xs text-slate-500">
              {entry.visitCount.toLocaleString('es-CL')} visitas
            </p>
          </li>
        ))}
      </ol>
      {rest.length > 0 ? (
        <details className="border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800 hover:text-teal-800">
            Ver más ({rest.length.toLocaleString('es-CL')} personas)
          </summary>
          <div
            role="region"
            aria-label="Resto del ranking"
            tabIndex={0}
            className="overflow-x-auto"
          >
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">
                Ranking desde el sexto lugar
              </caption>
              <thead>
                <tr className="border-y border-slate-200 text-xs tracking-wider text-slate-500 uppercase">
                  <th scope="col" className="px-4 py-2">
                    #
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Persona
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Tiempo total
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Visitas
                  </th>
                </tr>
              </thead>
              <tbody>
                {rest.map((entry, index) => (
                  <tr key={entry.userId} className="border-b border-slate-100">
                    <td className="px-4 py-2 font-mono">{index + 6}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium text-slate-900">
                        {entry.name}
                      </span>{' '}
                      <span className="text-xs text-slate-500">
                        {entry.email}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono">
                      {formatTotal(entry.totalMinutes)}
                    </td>
                    <td className="px-4 py-2">
                      {entry.visitCount.toLocaleString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
