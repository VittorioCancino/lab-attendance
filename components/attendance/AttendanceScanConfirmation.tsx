'use client';

import { useActionState } from 'react';

import {
  attendeeLogoutAction,
  switchAttendanceAccountAction,
} from '@/app/attendance/actions';
import { confirmAttendanceScanAction } from '@/app/scan/actions';
import type {
  AttendanceScanActionName,
  ConfirmAttendanceScanState,
} from '@/lib/types/attendance-scan.types';

const initialState: ConfirmAttendanceScanState = { status: 'IDLE' };

export function AttendanceScanConfirmation({
  checkedInAt,
  labName,
  nextAction,
  visitId,
  timezone,
  userName,
}: {
  checkedInAt: string | null;
  labName: string;
  nextAction: AttendanceScanActionName;
  visitId: string | null;
  timezone: string;
  userName: string;
}) {
  const [state, formAction, isPending] = useActionState(
    confirmAttendanceScanAction,
    initialState,
  );
  const timeFormatter = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  });
  const successAnnouncement =
    state.status === 'SUCCESS'
      ? state.action === 'CHECK_IN'
        ? 'Entrada registrada correctamente.'
        : 'Salida registrada correctamente.'
      : '';
  const announcement = (
    <span aria-live="assertive" className="sr-only" role="status">
      {successAnnouncement}
    </span>
  );

  if (state.status === 'SUCCESS') {
    const isCheckIn = state.action === 'CHECK_IN';

    return (
      <>
        {announcement}
        <main className="lab-grid grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-white">
          <section className="w-full max-w-lg border-t-4 border-emerald-400 bg-slate-950 p-7 shadow-[0_30px_100px_-30px_rgba(16,185,129,0.35)] ring-1 ring-white/15 sm:p-10">
            <div className="grid size-16 place-items-center bg-emerald-400 text-3xl font-semibold text-slate-950">
              <span aria-hidden="true">✓</span>
            </div>
            <p className="mt-8 text-xs font-bold tracking-[0.2em] text-emerald-300 uppercase">
              Registro confirmado
            </p>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.04em]">
              {isCheckIn ? 'Entrada registrada' : 'Salida registrada'}
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              {timeFormatter.format(new Date(state.occurredAt))}
            </p>
            {state.duplicate ? (
              <p className="mt-6 border-l-2 border-amber-300 pl-4 text-sm leading-6 text-amber-100">
                Este código ya había sido procesado. Se mantuvo el registro
                original sin cambiar su asistencia.
              </p>
            ) : null}
            <p className="mt-10 border-t border-white/10 pt-6 text-sm text-slate-400">
              Puede cerrar esta ventana de forma segura.
            </p>
            <form action={attendeeLogoutAction} className="mt-5">
              <button
                className="border-b border-slate-500 pb-0.5 text-sm font-semibold text-slate-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                type="submit"
              >
                Cerrar sesión
              </button>
            </form>
          </section>
        </main>
      </>
    );
  }

  const isCheckIn = nextAction === 'CHECK_IN';

  return (
    <>
      {announcement}
      <main className="lab-grid grid min-h-screen place-items-center bg-slate-100 px-5 py-8 text-slate-950">
        <section className="w-full max-w-lg bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.35)]">
          <div className="border-t-4 border-teal-700 p-7 sm:p-10">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-teal-800 uppercase">
                  {labName}
                </p>
                <p className="mt-2 text-sm text-slate-500">{userName}</p>
                <form action={switchAttendanceAccountAction} className="mt-2">
                  <button
                    className="border-b border-teal-700 pb-0.5 text-xs font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
                    type="submit"
                  >
                    Cambiar cuenta
                  </button>
                </form>
              </div>
              <span className="grid size-11 shrink-0 place-items-center bg-slate-950 text-xs font-bold tracking-wider text-white">
                LA
              </span>
            </div>

            <h1 className="mt-10 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
              {isCheckIn ? 'Confirmar entrada' : 'Confirmar salida'}
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              {isCheckIn
                ? 'Confirme para registrar su llegada al laboratorio.'
                : 'Confirme para registrar que finalizó su visita.'}
            </p>

            {checkedInAt === null ? null : (
              <dl className="mt-7 border-y border-slate-200 py-5 text-sm">
                <div className="flex items-center justify-between gap-6">
                  <dt className="text-slate-500">Entrada registrada</dt>
                  <dd className="text-right font-semibold text-slate-900">
                    {timeFormatter.format(new Date(checkedInAt))}
                  </dd>
                </div>
              </dl>
            )}

            {state.status === 'ERROR' ? (
              <p
                className="mt-7 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm leading-6 font-medium text-red-900"
                role="alert"
              >
                {state.error}
              </p>
            ) : null}

            <form action={formAction} className="mt-8">
              <input name="expectedAction" type="hidden" value={nextAction} />
              <input
                name="expectedVisitId"
                type="hidden"
                value={visitId ?? ''}
              />
              <button
                className="group flex w-full items-center justify-between bg-slate-950 px-5 py-4 text-left font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-65"
                disabled={isPending || state.status === 'ERROR'}
                type="submit"
              >
                <span>
                  {isPending
                    ? 'Registrando asistencia…'
                    : isCheckIn
                      ? 'Registrar mi entrada'
                      : 'Registrar mi salida'}
                </span>
                <span
                  aria-hidden="true"
                  className="transition group-hover:translate-x-1"
                >
                  →
                </span>
              </button>
            </form>
          </div>
          <p className="bg-slate-50 px-7 py-5 text-xs leading-5 text-slate-500 sm:px-10">
            La hora se registra en el servidor. Después de validar el código QR,
            dispone de cinco minutos para completar este registro.
          </p>
        </section>
      </main>
    </>
  );
}
