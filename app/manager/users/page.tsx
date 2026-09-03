import type { Metadata } from 'next';

import { LabMembershipRole } from '@/app/generated/prisma/client';
import {
  createAttendeeInvitationAction,
  revokeAttendeeInvitationAction,
  setAttendeeMembershipStatusAction,
} from '@/app/manager/actions';
import { AccessManagement } from '@/components/admin/AccessManagement';
import { requireLabManager } from '@/lib/auth/require-lab-manager';
import { listLabAccess } from '@/lib/db/memberships';
import { prisma } from '@/lib/db/prisma';
import { managementNoticeSchema } from '@/lib/types/membership.types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Usuarios | Administración local',
  description: 'Gestión de usuarios del laboratorio configurado.',
};

export default async function ManagerUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const query = await searchParams;
  const notice = managementNoticeSchema.safeParse(query.notice);
  const context = await requireLabManager();
  const access = await listLabAccess(
    prisma,
    context.lab.id,
    LabMembershipRole.ATTENDEE,
  );

  return (
    <AccessManagement
      access={access}
      createInvitationAction={createAttendeeInvitationAction}
      notice={notice.success ? notice.data : undefined}
      revokeInvitationAction={revokeAttendeeInvitationAction}
      role="ATTENDEE"
      setMembershipStatusAction={setAttendeeMembershipStatusAction}
      timezone={context.lab.timezone}
    />
  );
}
