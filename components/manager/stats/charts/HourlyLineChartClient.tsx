'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface HourlyChartDatum {
  hourLabel: string;
  occupancy: number;
}

export function HourlyLineChartClient({
  data,
  ariaLabel,
}: {
  ariaLabel: string;
  data: HourlyChartDatum[];
}) {
  return (
    <div>
      <div className="h-64" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -12, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="hourLabel"
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis allowDecimals={false} />
            <Tooltip
              formatter={(value) => [
                typeof value === 'number'
                  ? value % 1 === 0
                    ? String(value)
                    : value.toFixed(2)
                  : String(value),
                'ocupación',
              ]}
            />
            <Line
              type="monotone"
              dataKey="occupancy"
              stroke="#0f766e"
              strokeWidth={2.5}
              dot={false}
              name="Ocupación"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((point) => (
            <tr key={point.hourLabel}>
              <th scope="row">{point.hourLabel}</th>
              <td>{point.occupancy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
