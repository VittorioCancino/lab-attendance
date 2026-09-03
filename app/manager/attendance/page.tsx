import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import {
  checkInAttendeeAction,
  checkOutAttendeeAction,
} from '@/app/manager/attendance/actions';
import { AttendanceActionButton } from '@/components/manager/AttendanceActionButton';
import { AttendanceNotice } from '@/components/manager/AttendanceNotice';
import { AttendanceScheduleForm } from '@/components/manager/AttendanceScheduleForm';
import { requireLabManager } from '@/lib/auth/require-lab-manager';
import {
  ATTENDANCE_HISTORY_PAGE_SIZE,
  getManagerAttendanceData,
  type AttendanceHistoryCursor,
  type AttendanceHistoryEntry,
} from '@/lib/db/attendance';
import { prisma } from '@/lib/db/prisma';
import {
  attendanceMinuteToTime,
  managerAttendanceNoticeSchema,
} from '@/lib/types/attendance.types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Asistencia | Administración local',
  description:
    'Presencia actual, usuarios registrados e historial del laboratorio.',
};

const historyPageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(Math.floor(Number.MAX_SAFE_INTEGER / ATTENDANCE_HISTORY_PAGE_SIZE))
  .catch(1);
const historyThroughSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const historyCursorDirectionSchema = z.enum(['next', 'previous']);
const historyCursorIdSchema = z.uuid();

function getAttendanceMethodLabel(
  method: AttendanceHistoryEntry['checkOutMethod'],
  managerName: string | null,
): string {
  if (method === null) {
    return 'No disponible';
  }

  if (method === 'QR') {
    return 'Código QR';
  }

  if (method === 'SYSTEM') {
    return 'Sistema';
  }

  return managerName === null
    ? 'Registro manual'
    : `Registro manual por ${managerName}`;
}

function getNoticeMessage(
  notice: z.infer<typeof managerAttendanceNoticeSchema>,
): string {
  switch (notice) {
    case 'check-in-recorded':
      return 'La entrada fue registrada.';
    case 'check-in-closed':
      return 'No se registró la entrada porque el laboratorio está fuera del horario operativo.';
    case 'check-out-recorded':
      return 'La salida fue registrada.';
    case 'schedule-changed':
      return 'El horario cambió mientras completaba el formulario. Revise la configuración actual antes de intentarlo nuevamente.';
    case 'schedule-updated':
      return 'El horario de asistencia fue actualizado.';
    case 'state-changed':
      return 'El estado de asistencia cambió antes de completar la solicitud. Revise la información actualizada.';
    case 'unavailable':
      return 'No fue posible registrar la asistencia de esta persona.';
  }
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function formatDuration(checkedInAt: Date, checkedOutAt: Date): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((checkedOutAt.getTime() - checkedInAt.getTime()) / 60_000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${String(minutes)} min`;
  }

  return minutes === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(minutes)} min`;
}

function getHistoryPageHref(
  page: number,
  through: Date,
  direction: AttendanceHistoryCursor['direction'],
  cursor: AttendanceHistoryEntry,
): string {
  const query = new URLSearchParams({
    cursorAt: cursor.checkedInAt.toISOString(),
    cursorId: cursor.visitId,
    direction,
    page: String(page),
    through: through.toISOString(),
  });

  return `/manager/attendance?${query.toString()}#historial`;
}

export default async function ManagerAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    cursorAt?: string | string[];
    cursorId?: string | string[];
    direction?: string | string[];
    notice?: string | string[];
    page?: string | string[];
    through?: string | string[];
  }>;
}) {
  const context = await requireLabManager();
  const query = await searchParams;
  const requestedPage = historyPageSchema.parse(
    typeof query.page === 'string' ? query.page : undefined,
  );
  const requestedThrough = historyThroughSchema.safeParse(
    typeof query.through === 'string' ? query.through : undefined,
  );
  const requestedCursorAt = historyThroughSchema.safeParse(
    typeof query.cursorAt === 'string' ? query.cursorAt : undefined,
  );
  const requestedCursorId = historyCursorIdSchema.safeParse(
    typeof query.cursorId === 'string' ? query.cursorId : undefined,
  );
  const requestedCursorDirection = historyCursorDirectionSchema.safeParse(
    typeof query.direction === 'string' ? query.direction : undefined,
  );
  const requestedNotice = managerAttendanceNoticeSchema.safeParse(
    typeof query.notice === 'string' ? query.notice : undefined,
  );
  const requestedCursor =
    requestedThrough.success &&
    requestedCursorAt.success &&
    requestedCursorAt.data <= requestedThrough.data &&
    requestedCursorId.success &&
    requestedCursorDirection.success
      ? {
          checkedInAt: requestedCursorAt.data,
          direction: requestedCursorDirection.data,
          visitId: requestedCursorId.data,
        }
      : undefined;
  const attendance = await getManagerAttendanceData(
    prisma,
    context.lab.id,
    requestedPage,
    requestedThrough.success ? requestedThrough.data : undefined,
    requestedCursor,
  );
  const dateTimeFormatter = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: context.lab.timezone,
  });
  const dateFormatter = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeZone: context.lab.timezone,
  });
  const currentPresenceByUserId = new Map(
    attendance.currentPresence.map((entry) => [entry.userId, entry]),
  );
  const firstHistoryEntry = attendance.history.entries.at(0);
  const lastHistoryEntry = attendance.history.entries.at(-1);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end">
        <div>
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-10 bg-teal-700" />
            <p className="text-xs font-bold tracking-[0.22em] text-teal-800 uppercase">
              Control de presencia
            </p>
          </div>
          <h1 className="max-w-4xl text-5xl leading-[0.98] font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl">
            Asistencia del laboratorio
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Consulte quién se encuentra en el laboratorio, revise el registro de
            personas y examine el historial completo de visitas.
          </p>
        </div>

        <aside className="border-t-4 border-emerald-400 bg-slate-950 p-6 text-white sm:p-7">
          <div className="flex items-center justify-between gap-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-emerald-300 uppercase">
              Presencia actual
            </p>
            <span className="size-2 rounded-full bg-emerald-400 ring-4 ring-emerald-400/15" />
          </div>
          <p className="mt-5 text-6xl font-semibold tracking-tight">
            {attendance.currentPresence.length.toLocaleString('es-CL')}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {attendance.currentPresence.length === 1
              ? 'persona en el laboratorio'
              : 'personas en el laboratorio'}
          </p>
          <p className="mt-5 border-t border-white/10 pt-4 text-xs text-slate-400">
            Actualizado:{' '}
            <time dateTime={attendance.readAt.toISOString()}>
              {dateTimeFormatter.format(attendance.readAt)}
            </time>
          </p>
        </aside>
      </header>

      <nav
        aria-label="Secciones de asistencia"
        className="mt-10 grid border border-slate-300 bg-white sm:grid-cols-2 lg:grid-cols-4"
      >
        <a
          className="group flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 font-semibold text-slate-700 transition hover:bg-teal-50 hover:text-teal-900 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-teal-700 sm:border-r lg:border-b-0"
          href="#horario"
        >
          Horario operativo
          <span className="font-mono text-sm text-slate-600 group-hover:text-teal-800">
            {attendanceMinuteToTime(
              attendance.attendanceSchedule.opensAtMinute,
            )}
          </span>
        </a>
        <a
          className="group flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 font-semibold text-slate-700 transition hover:bg-teal-50 hover:text-teal-900 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-teal-700 lg:border-r lg:border-b-0"
          href="#presencia-actual"
        >
          Presencia actual
          <span className="font-mono text-sm text-slate-600 group-hover:text-teal-800">
            {attendance.currentPresence.length.toLocaleString('es-CL')}
          </span>
        </a>
        <a
          className="group flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 font-semibold text-slate-700 transition hover:bg-teal-50 hover:text-teal-900 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-teal-700 sm:border-r sm:border-b-0 lg:border-r"
          href="#usuarios-registrados"
        >
          Usuarios registrados
          <span className="font-mono text-sm text-slate-600 group-hover:text-teal-800">
            {attendance.registeredAttendees.length.toLocaleString('es-CL')}
          </span>
        </a>
        <a
          className="group flex items-center justify-between gap-4 px-5 py-4 font-semibold text-slate-700 transition hover:bg-teal-50 hover:text-teal-900 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-teal-700"
          href="#historial"
        >
          Historial
          <span className="font-mono text-sm text-slate-600 group-hover:text-teal-800">
            {attendance.history.totalCount.toLocaleString('es-CL')}
          </span>
        </a>
      </nav>

      {requestedNotice.success ? (
        <AttendanceNotice
          message={getNoticeMessage(requestedNotice.data)}
          tone={
            requestedNotice.data === 'check-in-recorded' ||
            requestedNotice.data === 'check-out-recorded' ||
            requestedNotice.data === 'schedule-updated'
              ? 'SUCCESS'
              : 'CAUTION'
          }
        />
      ) : null}

      <section className="mt-14 scroll-mt-8" id="horario">
        <div className="grid border border-slate-300 bg-white lg:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="border-t-4 border-teal-700 p-6 sm:p-8 lg:border-r lg:p-10">
            <p className="text-xs font-bold tracking-[0.18em] text-teal-800 uppercase">
              Configuración diaria
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Horario operativo
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-slate-600">
              Defina las horas de apertura y cierre para el registro de
              asistencia. Las entradas se bloquean fuera de este intervalo y las
              visitas abiertas se finalizan automáticamente al cierre.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-slate-200 pt-6">
              <div>
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Intervalo vigente
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-slate-950">
                  {attendanceMinuteToTime(
                    attendance.attendanceSchedule.opensAtMinute,
                  )}{' '}
                  a{' '}
                  {attendanceMinuteToTime(
                    attendance.attendanceSchedule.closesAtMinute,
                  )}
                </p>
              </div>
              <span
                className={`border px-3 py-2 text-xs font-bold tracking-[0.12em] uppercase ${
                  attendance.attendanceSchedule.isOpen
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-slate-300 bg-slate-100 text-slate-600'
                }`}
              >
                {attendance.attendanceSchedule.isOpen
                  ? 'Abierto ahora'
                  : 'Cerrado ahora'}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 p-6 sm:p-8 lg:p-10">
            <AttendanceScheduleForm
              key={`${String(attendance.attendanceSchedule.opensAtMinute)}-${String(attendance.attendanceSchedule.closesAtMinute)}`}
              closesAtMinute={attendance.attendanceSchedule.closesAtMinute}
              opensAtMinute={attendance.attendanceSchedule.opensAtMinute}
              timezone={context.lab.timezone}
            />
          </div>
        </div>
      </section>

      <section className="mt-14 scroll-mt-8" id="presencia-actual">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-emerald-700 uppercase">
              Ahora
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Personas presentes
            </h2>
          </div>
          <div className="max-w-xl text-sm leading-6 text-slate-500">
            <p>
              Una persona permanece en esta lista mientras su visita no tenga
              una hora de salida registrada.
            </p>
            <a
              className="mt-2 inline-block border-b border-teal-700 font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
              href="/manager/attendance"
            >
              Actualizar vista
            </a>
          </div>
        </div>

        {attendance.currentPresence.length === 0 ? (
          <div className="mt-6 border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <span className="mx-auto block size-3 rounded-full bg-slate-300 ring-8 ring-slate-200/60" />
            <h3 className="mt-6 text-lg font-semibold text-slate-900">
              No hay personas presentes
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              No existen visitas abiertas en este momento.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {attendance.currentPresence.map((entry) => {
              const accessUnavailable =
                !entry.isAccountActive || !entry.isMembershipActive;

              return (
                <article
                  className="border border-l-4 border-slate-300 border-l-emerald-500 bg-white p-5 shadow-sm shadow-slate-900/5"
                  key={entry.visitId}
                >
                  <div className="flex items-start gap-4">
                    <span
                      aria-hidden="true"
                      className="grid size-11 shrink-0 place-items-center bg-emerald-50 text-sm font-bold text-emerald-800"
                    >
                      {getInitials(entry.name)}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-950">
                        {entry.name}
                      </h3>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {entry.email}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-5 border-t border-slate-200 pt-4 text-sm">
                    <div className="flex items-center justify-between gap-5">
                      <dt className="text-slate-500">Entrada</dt>
                      <dd className="text-right font-medium text-slate-800">
                        <time dateTime={entry.checkedInAt.toISOString()}>
                          {dateTimeFormatter.format(entry.checkedInAt)}
                        </time>
                      </dd>
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-5">
                      <dt className="text-slate-500">Método</dt>
                      <dd className="text-right text-xs leading-5 font-medium text-slate-700">
                        {getAttendanceMethodLabel(
                          entry.checkInMethod,
                          entry.checkInManagerName,
                        )}
                      </dd>
                    </div>
                  </dl>
                  {accessUnavailable ? (
                    <p className="mt-4 border-l-2 border-amber-500 pl-3 text-xs leading-5 text-amber-800">
                      El acceso de esta persona está deshabilitado.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-16 scroll-mt-8" id="usuarios-registrados">
        <div className="flex items-end justify-between gap-6 border-b border-slate-300 pb-5">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-teal-800 uppercase">
              Registro local
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Usuarios registrados
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Las entradas y salidas manuales se registran con la hora actual
              del servidor.
            </p>
          </div>
          <p className="hidden text-sm text-slate-500 sm:block">
            {attendance.registeredAttendees.length.toLocaleString('es-CL')}{' '}
            {attendance.registeredAttendees.length === 1
              ? 'registro'
              : 'registros'}
          </p>
        </div>

        {attendance.registeredAttendees.length === 0 ? (
          <p className="border border-t-0 border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            No hay usuarios registrados en este laboratorio.
          </p>
        ) : (
          <div
            aria-label="Tabla de usuarios registrados"
            className="overflow-x-auto border-x border-b border-slate-300 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            role="region"
            tabIndex={0}
          >
            <table className="w-full min-w-3xl text-left text-sm">
              <caption className="sr-only">
                Usuarios registrados en el laboratorio
              </caption>
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-6 py-3 font-semibold" scope="col">
                    Persona
                  </th>
                  <th className="px-6 py-3 font-semibold" scope="col">
                    Presencia y acción
                  </th>
                  <th className="px-6 py-3 font-semibold" scope="col">
                    Acceso
                  </th>
                  <th className="px-6 py-3 font-semibold" scope="col">
                    Registro
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {attendance.registeredAttendees.map((attendee) => {
                  const currentVisit = currentPresenceByUserId.get(
                    attendee.userId,
                  );
                  const isPresent = currentVisit !== undefined;
                  const canCheckIn =
                    attendee.isAccountActive &&
                    attendee.isMembershipActive &&
                    attendance.attendanceSchedule.isOpen;
                  const accessLabel = !attendee.isAccountActive
                    ? 'Cuenta deshabilitada'
                    : attendee.isMembershipActive
                      ? 'Habilitado'
                      : 'Membresía inactiva';

                  return (
                    <tr key={attendee.userId}>
                      <th
                        className="px-6 py-4 text-left font-normal"
                        scope="row"
                      >
                        <p className="font-semibold text-slate-900">
                          {attendee.name}
                        </p>
                        <p className="mt-1 text-slate-500">{attendee.email}</p>
                      </th>
                      <td className="px-6 py-4">
                        <p
                          className={
                            isPresent ? 'text-emerald-700' : 'text-slate-500'
                          }
                        >
                          {isPresent ? 'En el laboratorio' : 'Fuera'}
                        </p>
                        {currentVisit === undefined ? (
                          <form action={checkInAttendeeAction} className="mt-2">
                            <input
                              name="userId"
                              type="hidden"
                              value={attendee.userId}
                            />
                            <AttendanceActionButton
                              action="CHECK_IN"
                              disabled={!canCheckIn}
                              name={attendee.name}
                            />
                            {!canCheckIn ? (
                              <p className="mt-2 max-w-40 text-xs leading-5 text-slate-500">
                                {attendee.isAccountActive &&
                                attendee.isMembershipActive
                                  ? 'Fuera del horario operativo.'
                                  : 'El acceso está deshabilitado.'}
                              </p>
                            ) : null}
                          </form>
                        ) : (
                          <form
                            action={checkOutAttendeeAction}
                            className="mt-2"
                          >
                            <input
                              name="userId"
                              type="hidden"
                              value={attendee.userId}
                            />
                            <input
                              name="visitId"
                              type="hidden"
                              value={currentVisit.visitId}
                            />
                            <AttendanceActionButton
                              action="CHECK_OUT"
                              name={attendee.name}
                            />
                          </form>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={
                            attendee.isAccountActive &&
                            attendee.isMembershipActive
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                          }
                        >
                          {accessLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        <time dateTime={attendee.registeredAt.toISOString()}>
                          {dateFormatter.format(attendee.registeredAt)}
                        </time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-16 scroll-mt-8" id="historial">
        <div className="flex flex-col gap-3 border-b border-slate-300 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-teal-800 uppercase">
              Registro cronológico
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Historial de asistencia
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Horario de {context.lab.timezone}
          </p>
        </div>

        {attendance.history.entries.length === 0 ? (
          <p className="border border-t-0 border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Aún no existen registros de asistencia para este laboratorio.
          </p>
        ) : (
          <>
            <div
              aria-label="Tabla del historial de asistencia"
              className="overflow-x-auto border-x border-b border-slate-300 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              role="region"
              tabIndex={0}
            >
              <table className="w-full min-w-4xl text-left text-sm">
                <caption className="sr-only">
                  Historial de visitas al laboratorio
                </caption>
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 font-semibold" scope="col">
                      Persona
                    </th>
                    <th className="px-6 py-3 font-semibold" scope="col">
                      Entrada
                    </th>
                    <th className="px-6 py-3 font-semibold" scope="col">
                      Salida
                    </th>
                    <th className="px-6 py-3 font-semibold" scope="col">
                      Duración
                    </th>
                    <th className="px-6 py-3 font-semibold" scope="col">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {attendance.history.entries.map((entry) => (
                    <tr key={entry.visitId}>
                      <th
                        className="px-6 py-4 text-left font-normal"
                        scope="row"
                      >
                        <p className="font-semibold text-slate-900">
                          {entry.name}
                        </p>
                        <p className="mt-1 text-slate-500">{entry.email}</p>
                      </th>
                      <td className="px-6 py-4 text-slate-700">
                        <time
                          className="block"
                          dateTime={entry.checkedInAt.toISOString()}
                        >
                          {dateTimeFormatter.format(entry.checkedInAt)}
                        </time>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          {getAttendanceMethodLabel(
                            entry.checkInMethod,
                            entry.checkInManagerName,
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {entry.checkedOutAt === null ? (
                          <span className="text-slate-600">Pendiente</span>
                        ) : (
                          <>
                            <time
                              className="block"
                              dateTime={entry.checkedOutAt.toISOString()}
                            >
                              {dateTimeFormatter.format(entry.checkedOutAt)}
                            </time>
                            <span className="mt-1 block text-xs leading-5 text-slate-500">
                              {getAttendanceMethodLabel(
                                entry.checkOutMethod,
                                entry.checkOutManagerName,
                              )}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {entry.checkedOutAt === null
                          ? 'En curso'
                          : formatDuration(
                              entry.checkedInAt,
                              entry.checkedOutAt,
                            )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={
                            entry.checkedOutAt === null
                              ? 'font-medium text-emerald-700'
                              : 'text-slate-500'
                          }
                        >
                          {entry.checkedOutAt === null
                            ? 'Visita abierta'
                            : 'Finalizada'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav
              aria-label="Paginación del historial de asistencia"
              className="flex flex-col gap-4 border-x border-b border-slate-300 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-slate-500">
                {attendance.history.entries.length.toLocaleString('es-CL')}{' '}
                {attendance.history.entries.length === 1
                  ? 'registro en esta página'
                  : 'registros en esta página'}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {attendance.history.hasPrevious &&
                firstHistoryEntry !== undefined ? (
                  <Link
                    className="border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:border-teal-700 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    href={getHistoryPageHref(
                      attendance.history.page - 1,
                      attendance.history.through,
                      'previous',
                      firstHistoryEntry,
                    )}
                  >
                    Anterior
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="border border-slate-200 px-4 py-2 font-semibold text-slate-400"
                  >
                    Anterior
                  </span>
                )}
                <span className="text-sm text-slate-500">
                  Página {attendance.history.page.toLocaleString('es-CL')}
                </span>
                {attendance.history.hasNext &&
                lastHistoryEntry !== undefined ? (
                  <Link
                    className="border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:border-teal-700 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    href={getHistoryPageHref(
                      attendance.history.page + 1,
                      attendance.history.through,
                      'next',
                      lastHistoryEntry,
                    )}
                  >
                    Siguiente
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="border border-slate-200 px-4 py-2 font-semibold text-slate-400"
                  >
                    Siguiente
                  </span>
                )}
              </div>
            </nav>
          </>
        )}
      </section>
    </div>
  );
}
