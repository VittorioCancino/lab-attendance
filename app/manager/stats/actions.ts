'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireLabManager } from '@/lib/auth/require-lab-manager';
import { updateLabCapacity } from '@/lib/db/lab-settings';
import { prisma } from '@/lib/db/prisma';
import { logSecurityAudit } from '@/lib/logging/security-audit';
import {
  statsCapacityFormSchema,
  type StatsCapacityActionState,
  type StatsNotice,
} from '@/lib/types/stats.types';

const MANAGER_STATS_PATH = '/manager/stats';

function redirectWithNotice(notice: StatsNotice): never {
  revalidatePath(MANAGER_STATS_PATH);
  redirect(`${MANAGER_STATS_PATH}?notice=${notice}#capacidad`);
}

function parseCapacityInput(value: string): number | null {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function updateLabCapacityAction(
  _previousState: StatsCapacityActionState,
  formData: FormData,
): Promise<StatsCapacityActionState> {
  const context = await requireLabManager();
  const submittedMax = formData.get('maxOccupancy');
  const submittedExpected = formData.get('expectedMaxOccupancy');
  const values = {
    expectedMaxOccupancy:
      typeof submittedExpected === 'string' ? submittedExpected : '',
    maxOccupancy: typeof submittedMax === 'string' ? submittedMax : '',
  };
  const parsed = statsCapacityFormSchema.safeParse(values);

  if (!parsed.success) {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'ATTENDANCE_MANAGEMENT',
      labId: context.lab.id,
      operation: 'UPDATE_CAPACITY',
      outcome: 'REJECTED',
      reason: 'INVALID_INPUT',
    });

    return {
      error:
        'Revise la capacidad ingresada. Debe ser un entero entre 1 y 10000, o vacío para quitarla.',
      values,
    };
  }

  const result = await updateLabCapacity(prisma, {
    expectedMaxOccupancy: parseCapacityInput(parsed.data.expectedMaxOccupancy),
    labId: context.lab.id,
    maxOccupancy: parseCapacityInput(parsed.data.maxOccupancy),
  });

  if (!result.ok) {
    logSecurityAudit({
      actorUserId: context.user.id,
      event: 'ATTENDANCE_MANAGEMENT',
      labId: context.lab.id,
      operation: 'UPDATE_CAPACITY',
      outcome: 'REJECTED',
      reason: result.reason,
    });

    if (result.reason === 'STATE_CHANGED') {
      redirectWithNotice('capacity-changed');
    }

    return {
      error: 'No fue posible actualizar la capacidad del laboratorio.',
      values,
    };
  }

  logSecurityAudit({
    actorUserId: context.user.id,
    event: 'ATTENDANCE_MANAGEMENT',
    labId: context.lab.id,
    operation: 'UPDATE_CAPACITY',
    outcome: 'SUCCEEDED',
    reason: 'CAPACITY_UPDATED',
  });

  redirectWithNotice('capacity-updated');
}
