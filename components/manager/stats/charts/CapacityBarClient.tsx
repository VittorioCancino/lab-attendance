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

export function CapacityBarClient({
  present,
  capacity,
}: {
  capacity: number;
  present: number;
}) {
  const remaining = Math.max(0, capacity - present);
  const data = [{ name: 'Ocupación', presente: present, restante: remaining }];

  return (
    <div>
      <div
        className="h-56"
        role="img"
        aria-label={`Presentes ${String(present)} de ${String(capacity)}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 8, right: 16 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, Math.max(capacity, 1)]}
              allowDecimals={false}
            />
            <YAxis type="category" dataKey="name" width={90} />
            <Tooltip formatter={(value) => [String(value), 'personas']} />
            <Bar
              dataKey="presente"
              stackId="cap"
              fill="#0f766e"
              name="Presentes"
            />
            <Bar
              dataKey="restante"
              stackId="cap"
              fill="#ccfbf1"
              name="Disponible"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Ocupación actual frente a capacidad máxima</caption>
        <tbody>
          <tr>
            <th scope="row">Presentes</th>
            <td>{present}</td>
          </tr>
          <tr>
            <th scope="row">Capacidad máxima</th>
            <td>{capacity}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
