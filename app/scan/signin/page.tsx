import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AttendanceLoginForm } from '@/components/attendance/AttendanceLoginForm';
import { verifyPendingAttendanceScanToken } from '@/lib/auth/qr-tokens';
import { getCurrentUserContext } from '@/lib/auth/current-user';
import { PENDING_ATTENDANCE_SCAN_COOKIE_NAME } from '@/lib/const/qr';
import { parseServerEnvironment } from '@/lib/env';
import { getCurrentLab } from '@/lib/tenant/current-lab';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Identificarse | Registro de asistencia',
  description: 'Acceso para confirmar la asistencia al laboratorio.',
  referrer: 'no-referrer',
  robots: { follow: false, index: false, nocache: true },
};

export default async function AttendanceSignInPage() {
  const lab = await getCurrentLab();
  const environment = parseServerEnvironment(process.env);
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(
    PENDING_ATTENDANCE_SCAN_COOKIE_NAME,
  )?.value;

  if (
    pendingToken === undefined ||
    verifyPendingAttendanceScanToken(
      environment.QR_SIGNING_SECRET,
      lab.id,
      pendingToken,
    ) === null
  ) {
    redirect('/scan');
  }

  const context = await getCurrentUserContext();

  if (context?.user.access === 'ATTENDEE') {
    redirect('/scan');
  }

  return (
    <main className="lab-grid grid min-h-screen place-items-center bg-slate-950 px-5 py-8 text-slate-950">
      <section className="w-full max-w-md bg-white shadow-[0_30px_100px_-35px_rgba(20,184,166,0.45)]">
        <header className="border-t-4 border-teal-400 bg-slate-900 px-7 py-7 text-white sm:px-9">
          <div className="flex items-center justify-between gap-5">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-teal-300 uppercase">
                Registro de asistencia
              </p>
              <p className="mt-2 text-sm text-slate-300">{lab.name}</p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center border border-white/20 text-xs font-bold tracking-wider">
              LA
            </span>
          </div>
        </header>

        <div className="px-7 py-8 sm:px-9 sm:py-9">
          <h1 className="text-4xl font-semibold tracking-[-0.035em]">
            Confirme su identidad
          </h1>
          <p className="mt-4 leading-7 text-slate-600">
            Ingrese con su cuenta personal para continuar con el registro de
            entrada o salida.
          </p>

          {context === null ? null : (
            <p
              className="mt-6 border-l-2 border-amber-600 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
              role="status"
            >
              La sesión activa no corresponde a una cuenta de asistencia.
              Ingrese con la cuenta correcta para continuar.
            </p>
          )}

          <AttendanceLoginForm />
        </div>

        <p className="border-t border-slate-200 bg-slate-50 px-7 py-5 text-xs leading-5 text-slate-500 sm:px-9">
          Una vez validado el código QR, dispone de cinco minutos para completar
          el registro.
        </p>
      </section>
    </main>
  );
}
