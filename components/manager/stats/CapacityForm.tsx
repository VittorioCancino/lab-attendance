'use client';

import { useActionState } from 'react';

import { updateLabCapacityAction } from '@/app/manager/stats/actions';
import type { StatsCapacityActionState } from '@/lib/types/stats.types';

export function CapacityForm({
  maxOccupancy,
}: {
  maxOccupancy: number | null;
}) {
  const initialState: StatsCapacityActionState = {
    values: {
      expectedMaxOccupancy: maxOccupancy === null ? '' : String(maxOccupancy),
      maxOccupancy: maxOccupancy === null ? '' : String(maxOccupancy),
    },
  };
  const [state, formAction, isPending] = useActionState(
    updateLabCapacityAction,
    initialState,
  );
  const feedbackId = 'capacity-feedback';

  return (
    <form action={formAction} className="grid gap-4">
      <input
        name="expectedMaxOccupancy"
        type="hidden"
        value={state.values.expectedMaxOccupancy}
      />
      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="max-occupancy"
        >
          Capacidad máxima del laboratorio
        </label>
        <input
          aria-describedby={feedbackId}
          aria-invalid={state.error === undefined ? undefined : true}
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 font-mono text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          defaultValue={state.values.maxOccupancy}
          id="max-occupancy"
          inputMode="numeric"
          min={1}
          max={10000}
          name="maxOccupancy"
          placeholder="Ej. 40 (vacío = sin límite)"
          type="number"
        />
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Se usa para la barra de carga y el % de ocupación. Vacío deja los
        widgets en estado informativo.
      </p>
      <div aria-live="polite" id={feedbackId} role="status">
        {state.error === undefined ? null : (
          <p className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
            {state.error}
          </p>
        )}
      </div>
      <button
        className="w-fit bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        {isPending ? 'Guardando…' : 'Guardar capacidad'}
      </button>
    </form>
  );
}
