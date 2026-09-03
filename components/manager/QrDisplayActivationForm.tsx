'use client';

import { useActionState, useState } from 'react';

import { createDisplayActivationAction } from '@/app/manager/displays/actions';
import type { CreateDisplayActivationState } from '@/lib/types/qr.types';

const initialState: CreateDisplayActivationState = {};

export function QrDisplayActivationForm({ timezone }: { timezone: string }) {
  const [state, formAction, isPending] = useActionState(
    createDisplayActivationAction,
    initialState,
  );
  const [copiedCode, setCopiedCode] = useState<string>();
  const [copyFailedCode, setCopyFailedCode] = useState<string>();
  const expiresAt =
    state.expiresAt === undefined ? null : new Date(state.expiresAt);
  const expirationFormatter = new Intl.DateTimeFormat('es-CL', {
    timeStyle: 'short',
    timeZone: timezone,
  });

  function copyCode(): void {
    if (state.code === undefined) {
      return;
    }

    const code = state.code;

    try {
      void navigator.clipboard
        .writeText(code)
        .then(() => {
          setCopiedCode(code);
          setCopyFailedCode(undefined);
        })
        .catch(() => {
          setCopiedCode(undefined);
          setCopyFailedCode(code);
        });
    } catch {
      setCopiedCode(undefined);
      setCopyFailedCode(code);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="display-label"
        >
          Nombre de la pantalla
        </label>
        <input
          autoComplete="off"
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          defaultValue={state.label}
          id="display-label"
          maxLength={80}
          minLength={2}
          name="label"
          placeholder="Entrada principal"
          required
          type="text"
        />
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Use un nombre que permita identificar la pantalla al revocarla.
        </p>
      </div>

      <div aria-live="polite" className="min-h-6" role="status">
        {state.error === undefined ? null : (
          <p className="text-sm font-medium text-red-700">{state.error}</p>
        )}
        {state.success === undefined ? null : (
          <p className="text-sm font-medium text-emerald-800">
            {state.success}
          </p>
        )}
      </div>

      {state.code === undefined ? null : (
        <div className="border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-bold tracking-[0.16em] text-emerald-800 uppercase">
            Código de activación
          </p>
          <p className="mt-3 font-mono text-2xl font-semibold tracking-[0.12em] text-emerald-950 sm:text-3xl">
            {state.code}
          </p>
          {expiresAt === null ? null : (
            <p className="mt-2 text-sm text-emerald-900">
              Válido hasta las {expirationFormatter.format(expiresAt)}.
            </p>
          )}
          <button
            className="mt-4 border-b border-emerald-700 pb-0.5 text-sm font-semibold text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            onClick={copyCode}
            type="button"
          >
            {copiedCode === state.code ? 'Código copiado' : 'Copiar código'}
          </button>
          <span aria-live="polite" className="sr-only" role="status">
            {copiedCode === state.code
              ? 'El código de activación fue copiado.'
              : ''}
          </span>
          {copyFailedCode === state.code ? (
            <p className="mt-3 text-sm font-medium text-red-700" role="alert">
              No fue posible copiar el código. Ingréselo manualmente.
            </p>
          ) : null}
        </div>
      )}

      <button
        className="w-full bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        {isPending ? 'Generando código…' : 'Generar código de activación'}
      </button>
    </form>
  );
}
