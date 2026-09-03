import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { attendeeLogoutAction } from '@/app/attendance/actions';
import { getCurrentUserContext } from '@/lib/auth/current-user';
import { getLandingPath } from '@/lib/auth/landing';
import { getCurrentLab } from '@/lib/tenant/current-lab';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Mi asistencia | Asistencia de laboratorio',
  description: 'Acceso personal al registro de asistencia del laboratorio.',
  robots: { follow: false, index: false, nocache: true },
};

export default async function AttendancePage() {
  const [context, lab] = await Promise.all([
    getCurrentUserContext(),
    getCurrentLab(),
  ]);

  if (context !== null && context.user.access !== 'ATTENDEE') {
    redirect(getLandingPath(context.user.access));
  }

  return (
    <main className="lab-grid grid min-h-svh place-items-center bg-slate-950 px-5 py-10 text-white">
      <section className="grid w-full max-w-4xl overflow-hidden bg-white text-slate-950 shadow-[0_30px_100px_-35px_rgba(20,184,166,0.4)] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="border-t-4 border-teal-400 p-7 sm:p-10 lg:p-12">
          <p className="text-xs font-bold tracking-[0.2em] text-teal-800 uppercase">
            Registro de asistencia
          </p>
          <h1 className="mt-5 text-5xl leading-[0.98] font-semibold tracking-[-0.045em] sm:text-6xl">
            Escanee el código QR
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Para registrar una entrada o una salida, escanee el código QR
            vigente que aparece en la pantalla de {lab.name}.
          </p>
          <div className="mt-9 border-l-4 border-teal-700 bg-teal-50 px-5 py-4 text-sm leading-6 text-teal-950">
            Después de escanearlo, inicie sesión con su cuenta personal y
            confirme el registro. No comparta sus credenciales.
          </div>
        </div>

        <aside className="border-t border-slate-200 bg-slate-100 p-7 sm:p-9 lg:border-t-4 lg:border-l lg:border-t-slate-950">
          {context === null ? (
            <>
              <p className="text-xs font-bold tracking-[0.16em] text-slate-500 uppercase">
                Sin sesión activa
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                El acceso comienza con el QR
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                La identificación de asistentes solo está disponible después de
                validar un código vigente del laboratorio.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">
                Cuenta activa
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                {context.user.name}
              </h2>
              <p className="mt-2 text-sm break-all text-slate-500">
                {context.user.email}
              </p>
              <p className="mt-5 text-sm leading-6 text-slate-600">
                Su sesión está lista. Escanee el QR para iniciar un registro de
                asistencia.
              </p>
              <form action={attendeeLogoutAction} className="mt-7">
                <button
                  className="w-full bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
                  type="submit"
                >
                  Cerrar sesión
                </button>
              </form>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
