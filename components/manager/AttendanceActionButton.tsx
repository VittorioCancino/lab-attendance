'use client';

import { useFormStatus } from 'react-dom';

export function AttendanceActionButton({
  action,
  disabled = false,
  name,
}: {
  action: 'CHECK_IN' | 'CHECK_OUT';
  disabled?: boolean;
  name: string;
}) {
  const { pending } = useFormStatus();
  const isCheckIn = action === 'CHECK_IN';

  return (
    <button
      aria-busy={pending}
      aria-label={
        pending
          ? `Registrando la asistencia de ${name}`
          : `${isCheckIn ? 'Registrar la entrada' : 'Registrar la salida'} de ${name}`
      }
      aria-live="polite"
      className={`border-b text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 ${
        isCheckIn
          ? 'border-teal-700 text-teal-800 focus-visible:outline-teal-700'
          : 'border-amber-700 text-amber-800 focus-visible:outline-amber-700'
      }`}
      disabled={disabled || pending}
      type="submit"
    >
      {pending
        ? 'Registrando…'
        : isCheckIn
          ? 'Registrar entrada'
          : 'Registrar salida'}
    </button>
  );
}
