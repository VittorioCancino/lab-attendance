import 'server-only';

import type { PrismaClient } from '@/app/generated/prisma/client';

export type UpdateLabCapacityResult =
  | { ok: false; reason: 'NOT_AUTHORIZED' }
  | { ok: false; reason: 'STATE_CHANGED' }
  | { maxOccupancy: number | null; ok: true };

/**
 * Actualiza la capacidad máxima del laboratorio. `maxOccupancy === null`
 * quita el límite (los widgets de ocupación quedan en estado vacío).
 */
export async function updateLabCapacity(
  client: PrismaClient,
  input: {
    expectedMaxOccupancy: number | null;
    labId: string;
    maxOccupancy: number | null;
  },
): Promise<UpdateLabCapacityResult> {
  if (
    input.maxOccupancy !== null &&
    (!Number.isInteger(input.maxOccupancy) ||
      input.maxOccupancy < 1 ||
      input.maxOccupancy > 10000)
  ) {
    return { ok: false, reason: 'STATE_CHANGED' };
  }

  const lab = await client.lab.findUnique({
    where: { id: input.labId },
    select: { isActive: true, maxOccupancy: true },
  });

  if (lab === null || !lab.isActive) {
    return { ok: false, reason: 'NOT_AUTHORIZED' };
  }

  if (lab.maxOccupancy !== input.expectedMaxOccupancy) {
    return { ok: false, reason: 'STATE_CHANGED' };
  }

  const update = await client.lab.updateMany({
    where: { id: input.labId, isActive: true },
    data: { maxOccupancy: input.maxOccupancy },
  });

  if (update.count !== 1) {
    return { ok: false, reason: 'NOT_AUTHORIZED' };
  }

  return { maxOccupancy: input.maxOccupancy, ok: true };
}
