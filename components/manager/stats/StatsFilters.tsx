export function StatsFilters({
  avgScope,
  day,
  month,
  topScope,
}: {
  avgScope: 'month' | 'history';
  day: string;
  month: string;
  topScope: 'month' | 'history';
}) {
  return (
    <form
      action="/manager/stats"
      className="grid gap-4 border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"
      method="get"
    >
      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="stats-month"
        >
          Mes de cálculo
        </label>
        <input
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-2.5 font-mono text-slate-950 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          defaultValue={month}
          id="stats-month"
          name="month"
          type="month"
        />
        <p className="mt-1 text-xs text-slate-500">
          Resumen, entradas por día y top mensual.
        </p>
      </div>
      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="stats-day"
        >
          Día (uso por hora)
        </label>
        <input
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-2.5 font-mono text-slate-950 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          defaultValue={day}
          id="stats-day"
          name="day"
          type="date"
        />
        <p className="mt-1 text-xs text-slate-500">
          Máxima ocupación por bloque horario.
        </p>
      </div>
      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="stats-avg"
        >
          Promedio horario
        </label>
        <select
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-slate-950 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          defaultValue={avgScope}
          id="stats-avg"
          name="avgScope"
        >
          <option value="month">Mes seleccionado</option>
          <option value="history">Histórico</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Línea de uso promedio por hora.
        </p>
      </div>
      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="stats-top"
        >
          Top de permanencia
        </label>
        <select
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-slate-950 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          defaultValue={topScope}
          id="stats-top"
          name="topScope"
        >
          <option value="month">Mes seleccionado</option>
          <option value="history">Histórico</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Quiénes más tiempo acumulan.
        </p>
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <button
          className="w-fit bg-slate-950 px-5 py-2.5 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
          type="submit"
        >
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}
