import type { Metadata } from 'next';

import {
  createInvitationAction,
  revokeInvitationAction,
  setMembershipStatusAction,
} from '@/app/admin/access/actions';
import { LabMembershipRole } from '@/app/generated/prisma/client';
import { AccessManagement } from '@/components/admin/AccessManagement';
import { requireGlobalAdministrator } from '@/lib/auth/require-global-admin';
import { listLabAccess } from '@/lib/db/memberships';
import { prisma } from '@/lib/db/prisma';
import { managementNoticeSchema } from '@/lib/types/membership.types';

export const metadata: Metadata = {
  title: 'Administradores | Administración global',
  description: 'Gestión de administradores locales del laboratorio.',
};

export default async function AdminManagersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const query = await searchParams;
  const notice = managementNoticeSchema.safeParse(query.notice);
  const context = await requireGlobalAdministrator();
  const access = await listLabAccess(
    prisma,
    context.lab.id,
    LabMembershipRole.MANAGER,
  );

  return (
    <AccessManagement
      access={access}
      createInvitationAction={createInvitationAction}
      notice={notice.success ? notice.data : undefined}
      revokeInvitationAction={revokeInvitationAction}
      role="MANAGER"
      setMembershipStatusAction={setMembershipStatusAction}
      timezone={context.lab.timezone}
    />
  );
}
