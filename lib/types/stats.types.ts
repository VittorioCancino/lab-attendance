import { z } from 'zod';

export const statsMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido. Use el formato YYYY-MM.');

export const statsDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Día inválido. Use el formato YYYY-MM-DD.')
  .refine(
    (value) => {
      const [year, month, day] = value.split('-').map(Number) as [
        number,
        number,
        number,
      ];
      const date = new Date(Date.UTC(year, month - 1, day));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month &&
        date.getUTCDate() === day
      );
    },
    { message: 'Día inválido. Use una fecha calendario real.' },
  );

export const statsPeriodSchema = z.enum(['month', 'history']);

export type StatsPeriod = z.infer<typeof statsPeriodSchema>;

export interface StatsCapacityFormValues {
  expectedMaxOccupancy: string;
  maxOccupancy: string;
}

export interface StatsCapacityActionState {
  error?: string;
  values: StatsCapacityFormValues;
}

export const statsCapacityFormSchema = z
  .object({
    expectedMaxOccupancy: z.string().regex(/^(\d+)?$/, 'Capacidad inválida.'),
    maxOccupancy: z
      .string()
      .regex(/^\d*$/, 'La capacidad debe ser un número entero.')
      .refine((value) => value === '' || (Number(value) >= 1 && Number(value) <= 10000), {
        message: 'La capacidad debe estar entre 1 y 10000 (o vacío para quitarla).',
      }),
  })
  .strict();

export const statsNoticeSchema = z.enum([
  'capacity-updated',
  'capacity-changed',
  'capacity-invalid',
]);

export type StatsNotice = z.infer<typeof statsNoticeSchema>;
