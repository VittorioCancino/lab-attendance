import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { QRCodeSVG } from 'qrcode.react';

import { DisplayActivationForm } from '@/components/display/DisplayActivationForm';
import { QrDisplayRefresh } from '@/components/display/QrDisplayRefresh';
import { createRotatingQrToken } from '@/lib/auth/qr-tokens';
import { QR_DISPLAY_COOKIE_NAME } from '@/lib/const/qr';
import { reconcileLabAttendance } from '@/lib/db/attendance-policy';
import { getValidQrDisplaySession } from '@/lib/db/qr-displays';
import { prisma } from '@/lib/db/prisma';
import { parseServerEnvironment } from '@/lib/env';
import { getCurrentLab } from '@/lib/tenant/current-lab';
import { attendanceMinuteToTime } from '@/lib/types/attendance.types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Pantalla QR | Asistencia de laboratorio',
  description: 'Pantalla pública de acceso al registro de asistencia.',
  referrer: 'no-referrer',
  robots: { follow: false, index: false, nocache: true },
};

export default async function PublicDisplayPage() {
  const lab = await getCurrentLab();
  const environment = parseServerEnvironment(process.env);
  const cookieStore = await cookies();
  const displayToken = cookieStore.get(QR_DISPLAY_COOKIE_NAME)?.value;
  const displaySession =
    displayToken === undefined
      ? null
      : await getValidQrDisplaySession(prisma, {
          labId: lab.id,
          secret: environment.QR_SIGNING_SECRET,
          token: displayToken,
        });

  if (displaySession === null) {
    return (
      <main className="lab-grid grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-white">
        <section className="w-full max-w-lg border-t-4 border-teal-400 bg-slate-950 p-7 shadow-[0_30px_100px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/15 sm:p-10">
          <p className="text-xs font-bold tracking-[0.2em] text-teal-300 uppercase">
            {lab.name}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Activar pantalla QR
          </h1>
          <p className="mt-5 leading-7 text-slate-300">
            Esta pantalla no tiene acceso al panel del laboratorio. Necesita un
            código temporal para mostrar el QR de asistencia.
          </p>
          <DisplayActivationForm />
        </section>
      </main>
    );
  }

  const attendancePolicy = await reconcileLabAttendance(prisma, {
    labId: lab.id,
  });

  if (attendancePolicy === null) {
    throw new Error('The configured lab is not available.');
  }

  const qr = createRotatingQrToken(
    environment.QR_SIGNING_SECRET,
    lab.id,
    attendancePolicy.now,
  );
  const scanUrl = new URL('/scan', environment.LAB_INSTANCE_PUBLIC_URL);
  const expirationFormatter = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: lab.timezone,
  });

  scanUrl.hash = qr.token;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-8 text-white">
      <QrDisplayRefresh refreshAt={qr.refreshAt.getTime()} />
      <section className="grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(19rem,0.72fr)_minmax(24rem,1.28fr)] lg:items-center">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`size-2 rounded-full ring-4 ${
                attendancePolicy.isOpen
                  ? 'bg-emerald-400 ring-emerald-400/15'
                  : 'bg-amber-300 ring-amber-300/15'
              }`}
            />
            <p
              className={`text-xs font-bold tracking-[0.2em] uppercase ${
                attendancePolicy.isOpen ? 'text-emerald-300' : 'text-amber-200'
              }`}
            >
              {attendancePolicy.isOpen
                ? 'Entradas abiertas'
                : 'Entradas cerradas'}
            </p>
          </div>
          <p className="mt-6 text-sm font-semibold text-teal-300">{lab.name}</p>
          <h1 className="mt-3 text-5xl leading-[0.95] font-semibold tracking-[-0.045em] sm:text-6xl">
            Escanee para registrar su asistencia
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            {attendancePolicy.isOpen
              ? 'Abra la cámara de su teléfono, escanee el código e inicie sesión con su cuenta del laboratorio.'
              : `Las entradas están disponibles diariamente entre las ${attendanceMinuteToTime(attendancePolicy.attendanceOpensAtMinute)} y las ${attendanceMinuteToTime(attendancePolicy.attendanceClosesAtMinute)}. Si tiene una visita abierta, escanee el código para registrar su salida.`}
          </p>
          <dl className="mt-8 space-y-4 border-t border-white/10 pt-6 text-sm">
            <div className="flex justify-between gap-6">
              <dt className="text-slate-400">Pantalla</dt>
              <dd className="text-right text-slate-100">
                {displaySession.label}
              </dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="text-slate-400">Autorizada hasta</dt>
              <dd className="text-right text-slate-100">
                {expirationFormatter.format(displaySession.expiresAt)}
              </dd>
            </div>
          </dl>
        </div>

        <div
          className={`mx-auto w-full max-w-xl bg-white p-5 sm:p-8 ${
            attendancePolicy.isOpen
              ? 'shadow-[0_35px_100px_-30px_rgba(20,184,166,0.45)]'
              : 'shadow-[0_35px_100px_-30px_rgba(252,211,77,0.3)]'
          }`}
        >
          <QRCodeSVG
            bgColor="#ffffff"
            className="h-auto w-full"
            fgColor="#020617"
            level="M"
            title="Código QR para registrar asistencia"
            value={scanUrl.toString()}
          />
          <div className="mt-5 flex items-center justify-center gap-3 border-t border-slate-200 pt-5 text-center text-sm font-medium text-slate-600">
            <span className="size-2 rounded-full bg-teal-600" />
            El código se renueva automáticamente cada 60 segundos
          </div>
        </div>
      </section>
    </main>
  );
}
