import { InvitationForm } from '@/components/admin/InvitationForm';
import type { LabAccessList } from '@/lib/db/memberships';
import type {
  AccessMutationFormAction,
  CreateInvitationFormAction,
  ManagementNotice,
} from '@/lib/types/membership.types';

const noticeMessages: Record<ManagementNotice, string> = {
  'invitation-revoked': 'La invitación fue revocada.',
  'membership-updated': 'El estado del acceso fue actualizado.',
  'state-changed':
    'El acceso cambió antes de completar la solicitud. Revise la información actualizada.',
};

export function AccessManagement({
  access,
  createInvitationAction,
  notice,
  revokeInvitationAction,
  role,
  setMembershipStatusAction,
  timezone,
}: {
  access: LabAccessList;
  createInvitationAction: CreateInvitationFormAction;
  notice?: ManagementNotice;
  revokeInvitationAction: AccessMutationFormAction;
  role: 'ATTENDEE' | 'MANAGER';
  setMembershipStatusAction: AccessMutationFormAction;
  timezone: string;
}) {
  const isManager = role === 'MANAGER';
  const title = isManager ? 'Administradores locales' : 'Usuarios';
  const description = isManager
    ? 'Delegue la administración cotidiana del laboratorio y controle sus accesos vigentes.'
    : 'Administre las personas habilitadas para registrar su asistencia en este laboratorio.';
  const dateFormatter = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  });

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
      <header className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.2em] text-teal-800 uppercase">
          Gestión de accesos
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">{description}</p>
        {notice === undefined ? null : (
          <p
            className="mt-6 border-l-4 border-teal-700 bg-white px-4 py-3 text-sm font-medium text-slate-700"
            role="status"
          >
            {noticeMessages[notice]}
          </p>
        )}
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <aside className="border-t-4 border-teal-700 bg-white p-6 shadow-xl shadow-slate-900/5">
          <h2 className="text-xl font-semibold text-slate-950">
            Crear invitación
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            El enlace vence después de 72 horas y solo puede utilizarse una vez.
          </p>
          <div className="mt-7">
            <InvitationForm
              createInvitationAction={createInvitationAction}
              role={role}
            />
          </div>
        </aside>

        <div className="space-y-8">
          <section className="border border-slate-300 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <h2 className="font-semibold text-slate-950">
                Accesos registrados
              </h2>
              <span className="text-sm text-slate-500">
                {access.memberships.length}
              </span>
            </div>

            {access.memberships.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">
                Aún no hay accesos registrados en esta categoría.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-2xl text-left text-sm">
                  <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-6 py-3 font-semibold" scope="col">
                        Persona
                      </th>
                      <th className="px-6 py-3 font-semibold" scope="col">
                        Estado
                      </th>
                      <th className="px-6 py-3 font-semibold" scope="col">
                        Registro
                      </th>
                      <th
                        className="px-6 py-3 text-right font-semibold"
                        scope="col"
                      >
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {access.memberships.map((membership) => {
                      const activationUnavailable =
                        !membership.isAccountActive && !membership.isActive;
                      const status = !membership.isAccountActive
                        ? 'Cuenta deshabilitada'
                        : membership.isActive
                          ? 'Activo'
                          : 'Inactivo';

                      return (
                        <tr key={membership.userId}>
                          <th
                            className="px-6 py-4 text-left font-normal"
                            scope="row"
                          >
                            <p className="font-semibold text-slate-900">
                              {membership.name}
                            </p>
                            <p className="mt-1 text-slate-500">
                              {membership.email}
                            </p>
                          </th>
                          <td className="px-6 py-4">
                            <span
                              className={
                                membership.isAccountActive &&
                                membership.isActive
                                  ? 'text-emerald-700'
                                  : 'text-slate-500'
                              }
                            >
                              {status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            {dateFormatter.format(membership.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <form action={setMembershipStatusAction}>
                              <input
                                name="active"
                                type="hidden"
                                value={membership.isActive ? 'false' : 'true'}
                              />
                              <input name="role" type="hidden" value={role} />
                              <input
                                name="userId"
                                type="hidden"
                                value={membership.userId}
                              />
                              <button
                                aria-label={`${membership.isActive ? 'Desactivar' : 'Activar'} acceso de ${membership.name}`}
                                className="border-b border-slate-400 pb-0.5 font-semibold text-slate-700 hover:border-teal-700 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                                disabled={activationUnavailable}
                                title={
                                  activationUnavailable
                                    ? 'La cuenta de usuario está deshabilitada.'
                                    : undefined
                                }
                                type="submit"
                              >
                                {activationUnavailable
                                  ? 'No disponible'
                                  : membership.isActive
                                    ? 'Desactivar'
                                    : 'Activar'}
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="border border-slate-300 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-semibold text-slate-950">
                  Invitaciones pendientes
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Los enlaces no pueden recuperarse después de su creación.
                </p>
              </div>
              <span className="text-sm text-slate-500">
                {access.invitations.length}
              </span>
            </div>

            {access.invitations.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">
                No hay invitaciones pendientes.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {access.invitations.map((invitation) => {
                  return (
                    <li
                      className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                      key={invitation.id}
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {invitation.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {invitation.email}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {invitation.isExpired ? 'Vencida' : 'Vence'}:{' '}
                          {dateFormatter.format(invitation.expiresAt)}
                        </p>
                      </div>
                      <form action={revokeInvitationAction}>
                        <input
                          name="invitationId"
                          type="hidden"
                          value={invitation.id}
                        />
                        <input name="role" type="hidden" value={role} />
                        <button
                          aria-label={`Revocar invitación de ${invitation.name}`}
                          className="border-b border-red-300 pb-0.5 text-sm font-semibold text-red-700 hover:border-red-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-700"
                          type="submit"
                        >
                          Revocar
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
