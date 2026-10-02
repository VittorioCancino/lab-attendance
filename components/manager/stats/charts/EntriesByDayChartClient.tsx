'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface EntriesByDayDatum {
  day: number;
  entries: number;
}

export function EntriesByDayChartClient({
  data,
}: {
  data: EntriesByDayDatum[];
}) {
  return (
    <div>
      <div
        className="h-64"
        role="img"
        aria-label={`Entradas por día, ${String(data.length)} días`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -12, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" interval="preserveStartEnd" minTickGap={8} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(value) => [String(value), 'entradas']} />
            <Bar dataKey="entries" fill="#0f766e" name="Entradas" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Entradas por día del mes</caption>
        <tbody>
          {data.map((point) => (
            <tr key={point.day}>
              <th scope="row">{`Día ${String(point.day)}`}</th>
              <td>{point.entries}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
