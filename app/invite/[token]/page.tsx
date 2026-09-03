import type { Metadata } from 'next';
import Link from 'next/link';

import { InvitationAcceptanceForm } from '@/components/auth/InvitationAcceptanceForm';
import { getInvitationPreview } from '@/lib/db/invitations';
import { prisma } from '@/lib/db/prisma';
import { invitationTokenSchema } from '@/lib/types/membership.types';
import { getCurrentLab } from '@/lib/tenant/current-lab';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Invitación | Asistencia de laboratorio',
  description: 'Aceptación de una invitación al laboratorio.',
  referrer: 'no-referrer',
  robots: { follow: false, index: false, nocache: true },
};

function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@');

  if (separator <= 0) {
    return email;
  }

  const localPart = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const visibleCharacters = localPart.slice(0, Math.min(2, localPart.length));

  return `${visibleCharacters}***@${domain}`;
}

function InvalidInvitation() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-6 py-12">
      <section className="max-w-lg border-t-4 border-red-700 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-10">
        <p className="text-xs font-bold tracking-[0.18em] text-red-700 uppercase">
          Invitación no disponible
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          El enlace no es válido
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          La invitación venció, fue revocada o ya fue utilizada. Si ya la
          aceptó, inicie sesión. En caso contrario, solicite un enlace nuevo a
          la administración del laboratorio.
        </p>
        <Link
          className="mt-6 inline-block border-b border-teal-700 pb-1 font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
          href="/auth/signin"
        >
          Ir al inicio de sesión
        </Link>
      </section>
    </main>
  );
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const token = invitationTokenSchema.safeParse(rawToken);

  if (!token.success) {
    return <InvalidInvitation />;
  }

  const lab = await getCurrentLab();
  const invitation = await getInvitationPreview(prisma, token.data, lab.id);

  if (invitation?.status !== 'ACTIVE') {
    return <InvalidInvitation />;
  }

  const roleLabel =
    invitation.role === 'MANAGER' ? 'Administrador local' : 'Usuario';

  return (
    <main className="lab-grid grid min-h-screen place-items-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-xl border-t-4 border-teal-700 bg-white p-7 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.5)] sm:p-10">
        <p className="text-xs font-bold tracking-[0.2em] text-teal-800 uppercase">
          Invitación al laboratorio
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          Active su acceso
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          Complete la validación para incorporarse a {invitation.labName}.
        </p>

        <dl className="mt-7 grid gap-4 border-y border-slate-200 py-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Función</dt>
            <dd className="mt-1 font-semibold text-slate-900">{roleLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Correo invitado</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {maskEmail(invitation.email)}
            </dd>
          </div>
        </dl>

        <InvitationAcceptanceForm token={token.data} />
      </section>
    </main>
  );
}
