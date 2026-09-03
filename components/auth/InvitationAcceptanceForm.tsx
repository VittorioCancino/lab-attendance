'use client';

import { useActionState } from 'react';

import { acceptInvitationAction } from '@/app/invite/actions';
import type { InvitationAcceptanceState } from '@/lib/types/membership.types';

const initialState: InvitationAcceptanceState = {};

export function InvitationAcceptanceForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    acceptInvitationAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input name="token" type="hidden" value={token} />

      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="password"
        >
          Contraseña
        </label>
        <input
          aria-describedby="invitation-password-help"
          autoComplete="new-password"
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3.5 text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          id="password"
          minLength={12}
          name="password"
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
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3.5 text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          id="confirmation"
          minLength={12}
          name="confirmation"
          required
          type="password"
        />
      </div>

      <p
        className="text-sm leading-6 text-slate-500"
        id="invitation-password-help"
      >
        Si ya posee una cuenta, ingrese su contraseña actual. Si esta es su
        primera invitación, establezca una contraseña nueva.
      </p>

      <div aria-live="polite" className="min-h-6" role="status">
        {state.error === undefined ? null : (
          <p className="text-sm font-medium text-red-700">{state.error}</p>
        )}
      </div>

      <button
        className="w-full bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        {isPending ? 'Validando invitación…' : 'Aceptar invitación'}
      </button>
    </form>
  );
}
