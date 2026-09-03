'use client';

import { useActionState } from 'react';

import { loginAction } from '@/app/auth/signin/actions';
import type { LoginActionState } from '@/lib/types/auth.types';

const initialState: LoginActionState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-10 space-y-6">
      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="email"
        >
          Correo electrónico
        </label>
        <input
          autoComplete="email"
          autoFocus
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          id="email"
          inputMode="email"
          name="email"
          placeholder="nombre@institución.cl"
          required
          type="email"
        />
      </div>

      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor="password"
        >
          Contraseña
        </label>
        <input
          autoComplete="current-password"
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          id="password"
          name="password"
          placeholder="Ingrese su contraseña"
          required
          type="password"
        />
      </div>

      <div aria-live="polite" className="min-h-6" role="status">
        {state.error === undefined ? null : (
          <p className="text-sm font-medium text-red-700">{state.error}</p>
        )}
      </div>

      <button
        className="group flex w-full items-center justify-between rounded-sm bg-slate-950 px-5 py-4 text-left font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        <span>{isPending ? 'Verificando acceso…' : 'Iniciar sesión'}</span>
        <span
          aria-hidden="true"
          className="transition group-hover:translate-x-1"
        >
          →
        </span>
      </button>
    </form>
  );
}
