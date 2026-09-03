import type { Metadata } from 'next';
import { z } from 'zod';

import { revokeDisplayAction } from '@/app/manager/displays/actions';
import { QrDisplayActivationForm } from '@/components/manager/QrDisplayActivationForm';
import { requireLabManager } from '@/lib/auth/require-lab-manager';
import { listQrDisplays, type QrDisplayStatus } from '@/lib/db/qr-displays';
import { prisma } from '@/lib/db/prisma';
import { parseServerEnvironment } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pantallas QR | Administración local',
  description: 'Activación y revocación de pantallas QR del laboratorio.',
};

const noticeSchema = z.enum(['revoked', 'state-changed']);

const statusLabels: Record<QrDisplayStatus, string> = {
  ACTIVE: 'Activa',
  EXPIRED: 'Expirada',
  PENDING: 'Pendiente de activación',
  REVOKED: 'Revocada',
};

export default async function ManagerDisplaysPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const context = await requireLabManager();
  const environment = parseServerEnvironment(process.env);
  const query = await searchParams;
  const notice = noticeSchema.safeParse(query.notice);
  const displays = await listQrDisplays(prisma, context.lab.id);
  const activeDisplayCount = displays.filter(
    (display) => display.status === 'ACTIVE',
  ).length;
  const dateFormatter = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: context.lab.timezone,
  });
  const publicDisplayUrl = new URL(
    '/display',
    environment.LAB_INSTANCE_PUBLIC_URL,
  ).toString();

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
        <div>
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-10 bg-teal-700" />
            <p className="text-xs font-bold tracking-[0.22em] text-teal-800 uppercase">
              Tótems de asistencia
            </p>
          </div>
          <h1 className="max-w-4xl text-5xl leading-[0.98] font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl">
            Pantallas QR
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Autorice pantallas públicas sin iniciar una sesión administrativa y
            revoque su acceso cuando dejen de utilizarse.
          </p>
          {notice.success ? (
            <p
              className="mt-6 border-l-4 border-teal-700 bg-white px-4 py-3 text-sm font-medium text-slate-700"
              role="status"
            >
              {notice.data === 'revoked'
                ? 'La pantalla fue revocada.'
                : 'La pantalla ya había cambiado de estado.'}
            </p>
          ) : null}
        </div>

        <aside className="border-t-4 border-emerald-400 bg-slate-950 p-6 text-white">
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-300 uppercase">
            Pantallas activas
          </p>
          <p className="mt-4 text-6xl font-semibold tracking-tight">
            {activeDisplayCount.toLocaleString('es-CL')}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {activeDisplayCount === 1
              ? 'tótem autorizado'
              : 'tótems autorizados'}
          </p>
        </aside>
      </header>

      <section className="mt-12 grid gap-8 lg:grid-cols-[23rem_minmax(0,1fr)] lg:items-start">
        <aside className="border-t-4 border-teal-700 bg-white p-6 shadow-xl shadow-slate-900/5">
          <h2 className="text-xl font-semibold text-slate-950">
            Autorizar una pantalla
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            El código puede utilizarse una sola vez y vence después de 10
            minutos.
          </p>
          <div className="mt-7">
            <QrDisplayActivationForm timezone={context.lab.timezone} />
          </div>
        </aside>

        <div className="space-y-8">
          <section className="border border-slate-300 bg-white p-6 sm:p-8">
            <p className="text-xs font-bold tracking-[0.18em] text-teal-800 uppercase">
              Dirección pública
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              Abra esta dirección en el tótem
            </h2>
            <p className="mt-3 leading-7 text-slate-600">
              La pantalla solicitará el código de activación y no recibirá una
              sesión de usuario ni privilegios administrativos.
            </p>
            <p className="mt-5 overflow-x-auto border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-800">
              {publicDisplayUrl}
            </p>
            <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
              <p className="border-l-2 border-teal-600 pl-3 text-slate-600">
                Autorización válida durante 12 horas.
              </p>
              <p className="border-l-2 border-teal-600 pl-3 text-slate-600">
                Código QR renovado cada 60 segundos.
              </p>
              <p className="border-l-2 border-teal-600 pl-3 text-slate-600">
                Revocación disponible desde este panel.
              </p>
            </div>
          </section>

          <section className="border border-slate-300 bg-white">
            <div className="flex items-center justify-between gap-6 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-semibold text-slate-950">
                  Pantallas registradas
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Se muestran las 50 autorizaciones más recientes.
                </p>
              </div>
              <span className="text-sm text-slate-500">
                {displays.length.toLocaleString('es-CL')}
              </span>
            </div>

            {displays.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500">
                Aún no se han autorizado pantallas QR.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {displays.map((display) => (
                  <li
                    className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                    key={display.activationId}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-semibold text-slate-950">
                          {display.label}
                        </h3>
                        <span
                          className={
                            display.status === 'ACTIVE'
                              ? 'text-sm font-medium text-emerald-700'
                              : display.status === 'PENDING'
                                ? 'text-sm font-medium text-amber-700'
                                : 'text-sm text-slate-500'
                          }
                        >
                          {statusLabels[display.status]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        Creada por {display.createdByName} ·{' '}
                        {dateFormatter.format(display.createdAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {display.status === 'ACTIVE'
                          ? 'La sesión vence'
                          : display.status === 'PENDING'
                            ? 'El código vence'
                            : 'Vigencia finalizada'}{' '}
                        {dateFormatter.format(display.expiresAt)}
                      </p>
                    </div>
                    {display.canRevoke ? (
                      <form action={revokeDisplayAction}>
                        <input
                          name="activationId"
                          type="hidden"
                          value={display.activationId}
                        />
                        <button
                          aria-label={`Revocar pantalla ${display.label}`}
                          className="border-b border-red-300 pb-0.5 text-sm font-semibold text-red-700 hover:border-red-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-700"
                          type="submit"
                        >
                          Revocar
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
