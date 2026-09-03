import type { Metadata } from 'next';
import { z } from 'zod';

import { startInvitationSessionAction } from '@/app/invite/actions';

export const metadata: Metadata = {
  title: 'Invitación aceptada | Asistencia de laboratorio',
  description: 'Confirmación de acceso al laboratorio.',
  referrer: 'no-referrer',
  robots: { follow: false, index: false, nocache: true },
};

const acceptedAccessSchema = z.enum(['attendance', 'staff']);

export default async function InvitationAcceptedPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const access = acceptedAccessSchema.safeParse(parameters.access);
  const isAttendee = access.success && access.data === 'attendance';

  return (
    <main className="lab-grid grid min-h-screen place-items-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-xl border-t-4 border-emerald-700 bg-white p-7 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.5)] sm:p-10">
        <p className="text-xs font-bold tracking-[0.2em] text-emerald-800 uppercase">
          {isAttendee ? 'Cuenta habilitada' : 'Acceso activado'}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          La invitación fue aceptada
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          {isAttendee
            ? 'Para registrar su entrada o salida, escanee el código QR vigente en la pantalla del laboratorio.'
            : 'Inicie sesión con la cuenta invitada para ingresar al panel administrativo. Si existe otra sesión activa en este navegador, se cerrará de forma segura.'}
        </p>

        {isAttendee ? (
          <p className="mt-8 border-l-2 border-teal-700 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
            Las personas asistentes no pueden iniciar sesión desde el panel
            administrativo.
          </p>
        ) : (
          <form action={startInvitationSessionAction} className="mt-8">
            <button
              className="w-full bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
              type="submit"
            >
              Iniciar sesión con la cuenta invitada
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
