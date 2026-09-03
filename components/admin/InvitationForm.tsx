'use client';

import { useActionState, useState } from 'react';

import type {
  CreateInvitationFormAction,
  InvitationActionState,
} from '@/lib/types/membership.types';

const initialState: InvitationActionState = {};

export function InvitationForm({
  createInvitationAction,
  role,
}: {
  createInvitationAction: CreateInvitationFormAction;
  role: 'ATTENDEE' | 'MANAGER';
}) {
  const [state, formAction, isPending] = useActionState(
    createInvitationAction,
    initialState,
  );
  const [copiedPath, setCopiedPath] = useState<string>();
  const [copyFailure, setCopyFailure] = useState<{
    invitationPath: string;
    invitationUrl: string;
  }>();
  const roleLabel = role === 'MANAGER' ? 'administrador local' : 'usuario';

  function copyInvitation(): void {
    const invitationPath = state.invitationPath;

    if (invitationPath === undefined) {
      return;
    }

    const invitationUrl = new URL(invitationPath, window.location.origin);

    try {
      void navigator.clipboard
        .writeText(invitationUrl.toString())
        .then(() => {
          setCopiedPath(invitationPath);
          setCopyFailure(undefined);
        })
        .catch(() => {
          setCopiedPath(undefined);
          setCopyFailure({
            invitationPath,
            invitationUrl: invitationUrl.toString(),
          });
        });
    } catch {
      setCopiedPath(undefined);
      setCopyFailure({
        invitationPath,
        invitationUrl: invitationUrl.toString(),
      });
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <input name="role" type="hidden" value={role} />

      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor={`${role}-name`}
        >
          Nombre completo
        </label>
        <input
          autoComplete="name"
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          id={`${role}-name`}
          defaultValue={state.values?.name}
          maxLength={160}
          minLength={2}
          name="name"
          required
          type="text"
        />
      </div>

      <div>
        <label
          className="mb-2 block text-sm font-semibold text-slate-800"
          htmlFor={`${role}-email`}
        >
          Correo electrónico
        </label>
        <input
          autoComplete="email"
          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-slate-950 transition outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
          id={`${role}-email`}
          defaultValue={state.values?.email}
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </div>

      <p className="text-sm leading-6 text-slate-500">
        Si la persona ya tiene una cuenta global, conservará su nombre y
        contraseña actuales.
      </p>

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

      {state.invitationPath === undefined ? null : (
        <div className="border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-mono text-xs break-all text-emerald-950">
            {state.invitationPath}
          </p>
          <button
            className="mt-3 border-b border-emerald-700 text-sm font-semibold text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            onClick={copyInvitation}
            type="button"
          >
            {copiedPath === state.invitationPath
              ? 'Enlace copiado'
              : 'Copiar enlace completo'}
          </button>
          <span aria-live="polite" className="sr-only" role="status">
            {copiedPath === state.invitationPath
              ? 'El enlace de invitación fue copiado.'
              : ''}
          </span>
          {copyFailure?.invitationPath === state.invitationPath ? (
            <div className="mt-3" role="alert">
              <label
                className="text-sm font-medium text-red-700"
                htmlFor={`${role}-invitation-url`}
              >
                No fue posible copiar el enlace. Selecciónelo y cópielo
                manualmente.
              </label>
              <textarea
                className="mt-2 w-full resize-none border border-red-200 bg-white p-3 font-mono text-xs break-all text-slate-900 outline-none focus:border-red-700 focus:ring-4 focus:ring-red-700/10"
                id={`${role}-invitation-url`}
                onFocus={(event) => {
                  event.currentTarget.select();
                }}
                readOnly
                rows={3}
                value={copyFailure.invitationUrl}
              />
            </div>
          ) : null}
        </div>
      )}

      <button
        className="w-full bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        {isPending ? 'Generando invitación…' : `Invitar ${roleLabel}`}
      </button>
    </form>
  );
}
