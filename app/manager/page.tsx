import type { Metadata } from 'next';
import Link from 'next/link';

import { LabMembershipRole } from '@/app/generated/prisma/client';
import { requireLabManager } from '@/lib/auth/require-lab-manager';
import { listLabAccess } from '@/lib/db/memberships';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Administración local | Asistencia de laboratorio',
  description: 'Panel de administración local del laboratorio configurado.',
};

export default async function ManagerPage() {
  const context = await requireLabManager();
  const access = await listLabAccess(
    prisma,
    context.lab.id,
    LabMembershipRole.ATTENDEE,
  );
  const activeAttendeeCount = access.memberships.filter(
    (membership) => membership.isAccountActive && membership.isActive,
  ).length;
  const inactiveAttendeeCount = access.memberships.length - activeAttendeeCount;
  const pendingInvitationCount = access.invitations.filter(
    (invitation) => !invitation.isExpired,
  ).length;

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14 lg:py-20">
      <section className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)] lg:items-end">
        <div>
          <div className="mb-7 flex items-center gap-3">
            <span className="h-px w-10 bg-teal-700" />
            <p className="text-xs font-bold tracking-[0.22em] text-teal-800 uppercase">
              Gestión local
            </p>
          </div>
          <h1 className="max-w-3xl text-5xl leading-[0.98] font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
            Control diario del laboratorio
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
            Administre las personas autorizadas para registrar su asistencia en
            esta instancia, sin acceder a información de otros laboratorios.
          </p>
        </div>

        <aside className="border-t-4 border-teal-500 bg-slate-950 p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-teal-300 uppercase">
                Laboratorio actual
              </p>
              <p className="mt-3 text-2xl font-semibold">{context.lab.name}</p>
            </div>
            <span className="mt-1 size-2 rounded-full bg-emerald-400 ring-4 ring-emerald-400/15" />
          </div>
          <dl className="mt-8 space-y-4 border-t border-white/10 pt-6 text-sm">
            <div className="flex justify-between gap-6">
              <dt className="text-slate-400">Identificador</dt>
              <dd className="font-mono text-slate-100">{context.lab.slug}</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="text-slate-400">Zona horaria</dt>
              <dd className="text-right text-slate-100">
                {context.lab.timezone}
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="mt-14 grid border-y border-slate-300 bg-white sm:grid-cols-3 lg:mt-20">
        <article className="border-b border-slate-200 p-7 sm:border-r sm:border-b-0 sm:p-9">
          <p className="text-sm font-medium text-slate-500">
            Usuarios habilitados
          </p>
          <p className="mt-5 text-5xl font-semibold tracking-tight text-slate-950">
            {activeAttendeeCount.toLocaleString('es-CL')}
          </p>
        </article>
        <article className="border-b border-slate-200 p-7 sm:border-r sm:border-b-0 sm:p-9">
          <p className="text-sm font-medium text-slate-500">
            Invitaciones vigentes
          </p>
          <p className="mt-5 text-5xl font-semibold tracking-tight text-slate-950">
            {pendingInvitationCount.toLocaleString('es-CL')}
          </p>
        </article>
        <article className="p-7 sm:p-9">
          <p className="text-sm font-medium text-slate-500">
            Accesos inactivos
          </p>
          <p className="mt-5 text-5xl font-semibold tracking-tight text-slate-950">
            {inactiveAttendeeCount.toLocaleString('es-CL')}
          </p>
        </article>
      </section>

      <section className="mt-12 grid gap-8 bg-teal-50 p-7 sm:p-10 lg:grid-cols-[6rem_1fr_auto] lg:items-center">
        <p className="font-mono text-4xl text-teal-800/50">01</p>
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-teal-800 uppercase">
            Accesos del laboratorio
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            Incorporar usuarios mediante una invitación segura
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            Genere enlaces de un solo uso, revise invitaciones pendientes y
            mantenga actualizados los accesos locales.
          </p>
        </div>
        <Link
          className="w-fit bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
          href="/manager/users"
        >
          Administrar usuarios
        </Link>
      </section>

      <footer className="mt-10 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>Sesión de {context.user.name}</p>
        <p>Vista limitada al laboratorio de esta instancia</p>
      </footer>
    </div>
  );
}
