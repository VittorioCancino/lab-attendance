'use client';

import { useActionState } from 'react';

import { updateAttendanceScheduleAction } from '@/app/manager/attendance/actions';
import {
  attendanceMinuteToTime,
  type AttendanceScheduleActionState,
} from '@/lib/types/attendance.types';

export function AttendanceScheduleForm({
  closesAtMinute,
  opensAtMinute,
  timezone,
}: {
  closesAtMinute: number;
  opensAtMinute: number;
  timezone: string;
}) {
  const initialState: AttendanceScheduleActionState = {
    values: {
      closesAt: attendanceMinuteToTime(closesAtMinute),
      expectedClosesAt: attendanceMinuteToTime(closesAtMinute),
      expectedOpensAt: attendanceMinuteToTime(opensAtMinute),
      opensAt: attendanceMinuteToTime(opensAtMinute),
    },
  };
  const [state, formAction, isPending] = useActionState(
    updateAttendanceScheduleAction,
    initialState,
  );
  const feedbackId = 'attendance-schedule-feedback';

  return (
    <form action={formAction} className="grid gap-5">
      <input
        name="expectedClosesAt"
        type="hidden"
        value={state.values.expectedClosesAt}
      />
      <input
        name="expectedOpensAt"
        type="hidden"
        value={state.values.expectedOpensAt}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            className="mb-2 block text-sm font-semibold text-slate-800"
            htmlFor="attendance-opens-at"
          >
            Hora de apertura
          </label>
          <input
            aria-describedby={feedbackId}
            aria-invalid={state.error === undefined ? undefined : true}
            className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 font-mono text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
            defaultValue={state.values.opensAt}
            id="attendance-opens-at"
            name="opensAt"
            required
            step={60}
            type="time"
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-semibold text-slate-800"
            htmlFor="attendance-closes-at"
          >
            Hora de cierre
          </label>
          <input
            aria-describedby={feedbackId}
            aria-invalid={state.error === undefined ? undefined : true}
            className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 font-mono text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
            defaultValue={state.values.closesAt}
            id="attendance-closes-at"
            name="closesAt"
            required
            step={60}
            type="time"
          />
        </div>
      </div>

      <p className="text-xs leading-5 text-slate-500">
        Las horas corresponden a {timezone}. El cierre debe ser posterior a la
        apertura dentro del mismo día.
      </p>

      <div aria-live="polite" id={feedbackId} role="status">
        {state.error === undefined ? null : (
          <p className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
            {state.error}
          </p>
        )}
      </div>

      <button
        className="bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        {isPending ? 'Guardando horario…' : 'Guardar horario'}
      </button>
    </form>
  );
}
