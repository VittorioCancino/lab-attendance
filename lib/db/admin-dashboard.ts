import type { PrismaClient } from '@/app/generated/prisma/client';

export interface GlobalAdminDashboardData {
  activeAttendeeCount: number;
  activeManagerCount: number;
}

export async function getGlobalAdminDashboardData(
  client: PrismaClient,
  labId: string,
): Promise<GlobalAdminDashboardData> {
  const [activeManagerCount, activeAttendeeCount] = await Promise.all([
    client.labMembership.count({
      where: {
        isActive: true,
        labId,
        role: 'MANAGER',
        user: { isActive: true },
      },
    }),
    client.labMembership.count({
      where: {
        isActive: true,
        labId,
        role: 'ATTENDEE',
        user: { isActive: true },
      },
    }),
  ]);

  return { activeAttendeeCount, activeManagerCount };
}
