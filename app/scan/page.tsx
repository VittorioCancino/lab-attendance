import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { switchAttendanceAccountAction } from '@/app/attendance/actions';
import { AttendanceScanConfirmation } from '@/components/attendance/AttendanceScanConfirmation';
import { ScanQrExchange } from '@/components/attendance/ScanQrExchange';
import { verifyPendingAttendanceScanToken } from '@/lib/auth/qr-tokens';
import { getCurrentUserContext } from '@/lib/auth/current-user';
import { PENDING_ATTENDANCE_SCAN_COOKIE_NAME } from '@/lib/const/qr';
import { getAttendanceScanPreview } from '@/lib/db/attendance-scans';
import { prisma } from '@/lib/db/prisma';
import { parseServerEnvironment } from '@/lib/env';
import { getCurrentLab } from '@/lib/tenant/current-lab';
import { attendanceMinuteToTime } from '@/lib/types/attendance.types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Registrar asistencia | Asistencia de laboratorio',
  description: 'Confirmación de entrada o salida del laboratorio.',
  referrer: 'no-referrer',
  robots: { follow: false, index: false, nocache: true },
};

function ScanUnavailable({
  accountName,
  labName,
  message,
  title,
}: {
  accountName?: string;
  labName: string;
  message: string;
  title: string;
}) {
  return (
    <main className="lab-grid grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-white">
      <section className="w-full max-w-lg border-t-4 border-amber-300 bg-slate-950 p-7 ring-1 ring-white/15 sm:p-10">
        <p className="text-xs font-bold tracking-[0.2em] text-amber-200 uppercase">
          {labName}
        </p>
        <div className="mt-7 grid size-14 place-items-center border border-amber-300/30 bg-amber-300/10 text-2xl text-amber-100">
          <span aria-hidden="true">!</span>
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">{message}</p>
        {accountName === undefined ? null : (
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-sm leading-6 text-slate-400">
              Cuenta activa: <span className="text-white">{accountName}</span>
            </p>
            <form action={switchAttendanceAccountAction} className="mt-4">
              <button
                className="border-b border-amber-200 pb-0.5 text-sm font-semibold text-amber-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200"
                type="submit"
              >
                Cambiar cuenta
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}

export default async function ScanPage() {
  const lab = await getCurrentLab();
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(
    PENDING_ATTENDANCE_SCAN_COOKIE_NAME,
  )?.value;

  if (pendingToken === undefined) {
    return <ScanQrExchange labName={lab.name} />;
  }

  const environment = parseServerEnvironment(process.env);
  const claims = verifyPendingAttendanceScanToken(
    environment.QR_SIGNING_SECRET,
    lab.id,
    pendingToken,
  );

  if (claims === null) {
    return (
      <ScanQrExchange
        emptyTokenMessage="El código QR anterior ya no está vigente. Escanee el código visible actualmente en la pantalla del laboratorio."
        labName={lab.name}
      />
    );
  }

  const context = await getCurrentUserContext();

  if (context === null) {
    redirect('/scan/signin');
  }

  if (context.user.access !== 'ATTENDEE') {
    redirect('/scan/signin');
  }

  const preview = await getAttendanceScanPreview(prisma, {
    labId: lab.id,
    userId: context.user.id,
  });

  if (preview === null) {
    return (
      <ScanUnavailable
        accountName={context.user.name}
        labName={lab.name}
        message="No fue posible validar su acceso al laboratorio. Solicite asistencia a una persona administradora."
        title="Asistencia no disponible"
      />
    );
  }

  if (preview.nextAction === 'CHECK_IN' && !preview.checkInAllowed) {
    return (
      <ScanUnavailable
        accountName={context.user.name}
        labName={lab.name}
        message={`El registro de entradas está disponible entre las ${attendanceMinuteToTime(preview.attendanceOpensAtMinute)} y las ${attendanceMinuteToTime(preview.attendanceClosesAtMinute)}.`}
        title="Laboratorio cerrado"
      />
    );
  }

  return (
    <AttendanceScanConfirmation
      checkedInAt={preview.checkedInAt?.toISOString() ?? null}
      labName={lab.name}
      nextAction={preview.nextAction}
      timezone={lab.timezone}
      userName={context.user.name}
      visitId={preview.visitId}
    />
  );
}
