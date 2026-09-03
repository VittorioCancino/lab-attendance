'use client';

import { useActionState } from 'react';

import { changePasswordAction } from '@/app/admin/actions';
import type { ChangePasswordActionState } from '@/lib/types/auth.types';

const initialState: ChangePasswordActionState = {};

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changePasswordAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="currentPassword"
        >
          Contraseña actual
        </label>
        <input
          autoComplete="current-password"
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          id="currentPassword"
          name="currentPassword"
          required
          type="password"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            className="mb-2 block text-sm font-semibold text-slate-800"
            htmlFor="newPassword"
          >
            Nueva contraseña
          </label>
          <input
            aria-describedby="password-requirements"
            autoComplete="new-password"
            className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
            id="newPassword"
            minLength={12}
            name="newPassword"
            required
            type="password"
          />
        </div>

        <div>
          <label
            className="mb-2 block text-sm font-semibold text-slate-800"
            htmlFor="confirmation"
          >
            Confirmar contraseña
          </label>
          <input
            autoComplete="new-password"
            className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
            id="confirmation"
            minLength={12}
            name="confirmation"
            required
            type="password"
          />
        </div>
      </div>

      <p
        className="text-sm leading-6 text-slate-500"
        id="password-requirements"
      >
        Utilice al menos 12 caracteres. La nueva contraseña debe ser diferente
        de la actual.
      </p>

      <div aria-live="polite" className="min-h-6" role="status">
        {state.error === undefined ? null : (
          <p className="text-sm font-medium text-red-700">{state.error}</p>
        )}
      </div>

      <button
        className="flex w-full items-center justify-center bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
        disabled={isPending}
        type="submit"
      >
        {isPending ? 'Actualizando contraseña…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
