'use client';

import { useActionState } from 'react';

import { redeemDisplayActivationAction } from '@/app/display/actions';
import type { RedeemDisplayActivationState } from '@/lib/types/qr.types';

const initialState: RedeemDisplayActivationState = {};

export function DisplayActivationForm() {
  const [state, formAction, isPending] = useActionState(
    redeemDisplayActivationAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-200"
          htmlFor="activation-code"
        >
          Código de activación
        </label>
        <input
          aria-describedby="activation-code-help"
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full border border-slate-600 bg-slate-900 px-4 py-4 text-center font-mono text-xl tracking-[0.12em] text-white uppercase transition outline-none placeholder:text-slate-600 focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10 sm:text-2xl"
          id="activation-code"
          inputMode="text"
          maxLength={24}
          name="code"
          placeholder="ABCD-EFGH-JKLM-NPQR"
          required
          spellCheck={false}
          type="text"
        />
        <p
          className="mt-3 text-sm leading-6 text-slate-400"
          id="activation-code-help"
        >
          Ingrese el código generado por una persona administradora de este
          laboratorio.
        </p>
      </div>

      <div aria-live="polite" className="min-h-6" role="status">
        {state.error === undefined ? null : (
          <p className="text-sm font-medium text-red-300">{state.error}</p>
        )}
      </div>

      <button
        className="w-full bg-teal-400 px-5 py-4 font-semibold text-slate-950 transition hover:bg-teal-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300 disabled:cursor-wait disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? 'Activando pantalla…' : 'Activar pantalla QR'}
      </button>
    </form>
  );
}
