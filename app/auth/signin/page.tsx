import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/LoginForm';
import { getCurrentUserContext } from '@/lib/auth/current-user';
import { getLandingPath } from '@/lib/auth/landing';
import { getCurrentLab } from '@/lib/tenant/current-lab';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Iniciar sesión | Asistencia de laboratorio',
  description: 'Acceso al sistema de asistencia del laboratorio.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    invitationAccepted?: string;
    passwordChanged?: string;
  }>;
}) {
  const parameters = await searchParams;
  const context = await getCurrentUserContext();
  const attendeeOnStaffPanel = context?.user.access === 'ATTENDEE';

  if (context !== null && !attendeeOnStaffPanel) {
    redirect(getLandingPath(context.user.access));
  }

  const lab = await getCurrentLab();

  return (
    <main className="lab-grid min-h-screen bg-slate-100 px-5 py-8 sm:px-8 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(28rem,0.85fr)] lg:p-0">
      <section className="hidden min-h-screen flex-col justify-between bg-slate-950 p-12 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center border border-teal-300/40 bg-teal-300/10 text-sm font-bold tracking-wider text-teal-200">
            LA
          </span>
          <div>
            <p className="text-sm font-semibold">Asistencia de laboratorio</p>
            <p className="text-xs text-slate-400">
              Registro seguro por instancia
            </p>
          </div>
        </div>

        <div className="max-w-2xl">
          <p className="mb-6 text-xs font-semibold tracking-[0.24em] text-teal-300 uppercase">
            Instancia activa
          </p>
          <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight xl:text-7xl">
            Presencia clara,
            <span className="block text-slate-400">
              sin perder el contexto.
            </span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-slate-300">
            Cada acceso queda vinculado al laboratorio configurado en esta
            instancia y a sus permisos vigentes.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-6 text-sm text-slate-400">
          <span>{lab.name}</span>
          <span>{lab.timezone}</span>
        </div>
      </section>

      <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center lg:min-h-screen lg:bg-white lg:px-12">
        <div className="w-full max-w-md bg-white p-7 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.45)] sm:p-10 lg:p-0 lg:shadow-none">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center bg-slate-950 text-xs font-bold tracking-wider text-white">
              LA
            </span>
            <p className="text-sm font-semibold text-slate-800">{lab.name}</p>
          </div>

          <p className="text-xs font-semibold tracking-[0.2em] text-teal-800 uppercase">
            Acceso administrativo
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
            Inicie sesión
          </h2>
          <p className="mt-4 leading-7 text-slate-600">
            Ingrese con una cuenta de administración global o local.
          </p>

          {attendeeOnStaffPanel ? (
            <p
              className="mt-6 border-l-2 border-amber-600 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
              role="alert"
            >
              La cuenta activa no está autorizada para utilizar este panel. La
              asistencia se registra únicamente después de escanear el código QR
              del laboratorio.
            </p>
          ) : null}

          {parameters.passwordChanged === 'true' ? (
            <p
              className="mt-6 border-l-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
              role="status"
            >
              La contraseña fue actualizada. Inicie sesión nuevamente.
            </p>
          ) : null}

          {parameters.invitationAccepted === 'true' ? (
            <p
              className="mt-6 border-l-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
              role="status"
            >
              La invitación fue aceptada. Inicie sesión para continuar.
            </p>
          ) : null}

          <LoginForm />

          <p className="mt-10 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-500">
            Este panel está reservado para la administración del laboratorio.
          </p>
        </div>
      </section>
    </main>
  );
}
