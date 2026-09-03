import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LabMembershipRole } from '@/app/generated/prisma/client';
import {
  ATTENDANCE_HISTORY_PAGE_SIZE,
  getManagerAttendanceData,
} from '@/lib/db/attendance';
import { createPrismaClient } from '@/lib/db/client';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

const prisma = createPrismaClient(databaseUrl);

beforeEach(async () => {
  await prisma.attendanceScan.deleteMany();
  await prisma.attendanceVisit.deleteMany();
  await prisma.qrDisplaySession.deleteMany();
  await prisma.qrDisplayActivation.deleteMany();
  await prisma.labInvitation.deleteMany();
  await prisma.labMembership.deleteMany();
  await prisma.lab.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createLab(slug: string) {
  return prisma.lab.create({
    data: {
      name: `Laboratorio ${slug}`,
      slug,
      timezone: 'America/Santiago',
    },
  });
}

async function createAttendee(labIds: string[]) {
  const user = await prisma.user.create({
    data: {
      email: 'attendee@test.local',
      name: 'Usuario de prueba',
      passwordHash: 'not-used-in-schema-tests',
    },
  });

  await prisma.labMembership.createMany({
    data: labIds.map((labId) => ({
      labId,
      role: LabMembershipRole.ATTENDEE,
      userId: user.id,
    })),
  });

  return user;
}

describe('attendance visit schema', () => {
  it('uses the default schedule and rejects invalid same-day intervals', async () => {
    const lab = await createLab('first-lab');

    expect(lab).toMatchObject({
      attendanceClosesAtMinute: 1080,
      attendanceOpensAtMinute: 420,
    });
    await expect(
      prisma.lab.update({
        where: { id: lab.id },
        data: {
          attendanceClosesAtMinute: 420,
          attendanceOpensAtMinute: 1080,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.lab.update({
        where: { id: lab.id },
        data: { attendanceClosesAtMinute: 1440 },
      }),
    ).rejects.toThrow();
  });

  it('records server-time check-in and permits a new visit after checkout', async () => {
    const lab = await createLab('first-lab');
    const attendee = await createAttendee([lab.id]);
    const openVisit = await prisma.attendanceVisit.create({
      data: { labId: lab.id, userId: attendee.id },
    });

    expect(openVisit.checkedInAt).toBeInstanceOf(Date);
    expect(openVisit.checkInMethod).toBe('QR');
    expect(openVisit.checkedOutAt).toBeNull();

    const checkedOutAt = new Date(openVisit.checkedInAt.getTime() + 60_000);

    await prisma.attendanceVisit.update({
      where: { id: openVisit.id },
      data: { checkedOutAt, checkOutMethod: 'QR' },
    });

    await expect(
      prisma.attendanceVisit.create({
        data: { labId: lab.id, userId: attendee.id },
      }),
    ).resolves.toMatchObject({ checkedOutAt: null });
    await expect(prisma.attendanceVisit.count()).resolves.toBe(2);
  });

  it('allows at most one open visit per user and lab', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const attendee = await createAttendee([firstLab.id, secondLab.id]);

    await prisma.attendanceVisit.create({
      data: { labId: firstLab.id, userId: attendee.id },
    });

    await expect(
      prisma.attendanceVisit.create({
        data: { labId: firstLab.id, userId: attendee.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.attendanceVisit.create({
        data: { labId: secondLab.id, userId: attendee.id },
      }),
    ).resolves.toMatchObject({ labId: secondLab.id });
    await expect(prisma.attendanceVisit.count()).resolves.toBe(2);
  });

  it('rejects cross-lab visits and checkout before check-in', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const attendee = await createAttendee([firstLab.id]);
    const checkedInAt = new Date('2026-08-27T12:00:00.000Z');

    await expect(
      prisma.attendanceVisit.create({
        data: { labId: secondLab.id, userId: attendee.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.attendanceVisit.create({
        data: {
          checkedInAt,
          checkedOutAt: new Date(checkedInAt.getTime() - 1),
          checkOutMethod: 'QR',
          labId: firstLab.id,
          userId: attendee.id,
        },
      }),
    ).rejects.toThrow();
    await expect(prisma.attendanceVisit.count()).resolves.toBe(0);
  });

  it('enforces method state and tenant-bound manager actors', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const attendee = await createAttendee([firstLab.id]);
    const firstManager = await prisma.user.create({
      data: {
        email: 'first-manager@test.local',
        name: 'Administrador local',
        passwordHash: 'not-used-in-schema-tests',
        memberships: {
          create: {
            labId: firstLab.id,
            role: LabMembershipRole.MANAGER,
          },
        },
      },
    });
    const secondManager = await prisma.user.create({
      data: {
        email: 'second-manager@test.local',
        name: 'Administrador externo',
        passwordHash: 'not-used-in-schema-tests',
        memberships: {
          create: {
            labId: secondLab.id,
            role: LabMembershipRole.MANAGER,
          },
        },
      },
    });

    await expect(
      prisma.attendanceVisit.create({
        data: {
          checkInMethod: 'SYSTEM',
          labId: firstLab.id,
          userId: attendee.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.attendanceVisit.create({
        data: {
          checkInManagerUserId: secondManager.id,
          checkInMethod: 'MANAGER',
          labId: firstLab.id,
          userId: attendee.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    const managedVisit = await prisma.attendanceVisit.create({
      data: {
        checkInManagerUserId: firstManager.id,
        checkInMethod: 'MANAGER',
        labId: firstLab.id,
        userId: attendee.id,
      },
    });
    const checkedOutAt = new Date(managedVisit.checkedInAt.getTime() + 60_000);

    await expect(
      prisma.attendanceVisit.update({
        where: { id: managedVisit.id },
        data: { checkedOutAt },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.attendanceVisit.update({
        where: { id: managedVisit.id },
        data: {
          checkedOutAt,
          checkOutManagerUserId: firstManager.id,
          checkOutMethod: 'MANAGER',
        },
      }),
    ).resolves.toMatchObject({
      checkInManagerUserId: firstManager.id,
      checkInMethod: 'MANAGER',
      checkOutManagerUserId: firstManager.id,
      checkOutMethod: 'MANAGER',
    });
  });

  it('prevents deleting a membership that owns attendance history', async () => {
    const lab = await createLab('first-lab');
    const attendee = await createAttendee([lab.id]);

    await prisma.attendanceVisit.create({
      data: {
        checkedOutAt: new Date('2026-08-27T13:00:00.000Z'),
        checkOutMethod: 'QR',
        checkedInAt: new Date('2026-08-27T12:00:00.000Z'),
        labId: lab.id,
        userId: attendee.id,
      },
    });

    await expect(
      prisma.labMembership.delete({
        where: {
          labId_userId: { labId: lab.id, userId: attendee.id },
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.attendanceVisit.count()).resolves.toBe(1);
  });
});

describe('manager attendance reads', () => {
  it('returns only attendee attendance from the requested lab', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const [activeAttendee, inactiveAttendee, otherLabAttendee, manager] =
      await Promise.all([
        prisma.user.create({
          data: {
            email: 'active-attendee@test.local',
            name: 'Usuario activo',
            passwordHash: 'not-used-in-schema-tests',
          },
        }),
        prisma.user.create({
          data: {
            email: 'inactive-attendee@test.local',
            isActive: false,
            name: 'Usuario inactivo',
            passwordHash: 'not-used-in-schema-tests',
          },
        }),
        prisma.user.create({
          data: {
            email: 'other-lab@test.local',
            name: 'Usuario de otro laboratorio',
            passwordHash: 'not-used-in-schema-tests',
          },
        }),
        prisma.user.create({
          data: {
            email: 'manager@test.local',
            name: 'Administrador local',
            passwordHash: 'not-used-in-schema-tests',
          },
        }),
      ]);

    await prisma.labMembership.createMany({
      data: [
        {
          labId: firstLab.id,
          role: LabMembershipRole.ATTENDEE,
          userId: activeAttendee.id,
        },
        {
          labId: secondLab.id,
          role: LabMembershipRole.ATTENDEE,
          userId: activeAttendee.id,
        },
        {
          isActive: false,
          labId: firstLab.id,
          role: LabMembershipRole.ATTENDEE,
          userId: inactiveAttendee.id,
        },
        {
          labId: secondLab.id,
          role: LabMembershipRole.ATTENDEE,
          userId: otherLabAttendee.id,
        },
        {
          labId: firstLab.id,
          role: LabMembershipRole.MANAGER,
          userId: manager.id,
        },
      ],
    });
    await prisma.attendanceVisit.createMany({
      data: [
        {
          checkedInAt: new Date('2026-08-27T10:00:00.000Z'),
          id: randomUUID(),
          labId: firstLab.id,
          userId: activeAttendee.id,
        },
        {
          checkedInAt: new Date('2026-08-27T09:00:00.000Z'),
          id: randomUUID(),
          labId: firstLab.id,
          userId: inactiveAttendee.id,
        },
        {
          checkedInAt: new Date('2026-08-27T11:00:00.000Z'),
          id: randomUUID(),
          labId: secondLab.id,
          userId: otherLabAttendee.id,
        },
        {
          checkedInAt: new Date('2026-08-27T11:30:00.000Z'),
          id: randomUUID(),
          labId: secondLab.id,
          userId: activeAttendee.id,
        },
        {
          checkedInAt: new Date('2026-08-27T12:00:00.000Z'),
          id: randomUUID(),
          labId: firstLab.id,
          userId: manager.id,
        },
        {
          checkedInAt: new Date('2026-08-27T08:00:00.000Z'),
          checkedOutAt: new Date('2026-08-27T08:30:00.000Z'),
          checkOutMethod: 'QR',
          id: randomUUID(),
          labId: firstLab.id,
          userId: activeAttendee.id,
        },
      ],
    });

    const attendance = await getManagerAttendanceData(
      prisma,
      firstLab.id,
      1,
      undefined,
      undefined,
      new Date('2026-08-27T13:00:00.000Z'),
    );

    expect(attendance.currentPresence).toMatchObject([
      {
        isAccountActive: false,
        isMembershipActive: false,
        userId: inactiveAttendee.id,
      },
      {
        isAccountActive: true,
        isMembershipActive: true,
        userId: activeAttendee.id,
      },
    ]);
    expect(attendance.registeredAttendees).toMatchObject([
      { userId: activeAttendee.id },
      { userId: inactiveAttendee.id },
    ]);
    expect(attendance.history.totalCount).toBe(3);
    expect(attendance.history.entries.map((entry) => entry.userId)).toEqual([
      activeAttendee.id,
      inactiveAttendee.id,
      activeAttendee.id,
    ]);
    expect(
      attendance.history.entries.every(
        (entry) =>
          entry.checkInMethod === 'QR' && entry.checkInManagerName === null,
      ),
    ).toBe(true);
  });

  it('paginates and clamps attendance history', async () => {
    const lab = await createLab('first-lab');
    const attendee = await createAttendee([lab.id]);
    const firstCheckIn = new Date('2026-08-01T12:00:00.000Z');
    const readAt = new Date('2026-08-02T00:00:00.000Z');
    const visitData = Array.from(
      { length: ATTENDANCE_HISTORY_PAGE_SIZE + 2 },
      (_, index) => {
        const checkedInAt = new Date(firstCheckIn.getTime() + index * 60_000);

        return {
          checkedInAt,
          checkedOutAt: new Date(checkedInAt.getTime() + 30_000),
          checkOutMethod: 'QR' as const,
          id: randomUUID(),
          labId: lab.id,
          userId: attendee.id,
        };
      },
    );

    await prisma.attendanceVisit.createMany({
      data: visitData,
    });

    const firstPage = await getManagerAttendanceData(
      prisma,
      lab.id,
      1,
      undefined,
      undefined,
      readAt,
    );
    const firstPageLastEntry = firstPage.history.entries.at(-1);

    expect(firstPageLastEntry).toBeDefined();

    if (firstPageLastEntry === undefined) {
      return;
    }

    const secondPage = await getManagerAttendanceData(
      prisma,
      lab.id,
      2,
      firstPage.history.through,
      {
        checkedInAt: firstPageLastEntry.checkedInAt,
        direction: 'next',
        visitId: firstPageLastEntry.visitId,
      },
      readAt,
    );
    const directPage = await getManagerAttendanceData(
      prisma,
      lab.id,
      999,
      undefined,
      undefined,
      readAt,
    );
    const defaultPage = await getManagerAttendanceData(
      prisma,
      lab.id,
      0,
      undefined,
      undefined,
      readAt,
    );

    expect(secondPage.history).toMatchObject({
      page: 2,
      pageSize: ATTENDANCE_HISTORY_PAGE_SIZE,
      totalCount: ATTENDANCE_HISTORY_PAGE_SIZE + 2,
      totalPages: 2,
    });
    expect(secondPage.history.entries).toHaveLength(2);
    expect(secondPage.history).toMatchObject({
      hasNext: false,
      hasPrevious: true,
    });
    expect(firstPage.history.entries).toHaveLength(
      ATTENDANCE_HISTORY_PAGE_SIZE,
    );
    expect(firstPage.history.entries[0]?.checkedInAt).toEqual(
      visitData.at(-1)?.checkedInAt,
    );
    expect(secondPage.history.entries[0]?.checkedInAt).toEqual(
      visitData[1]?.checkedInAt,
    );
    expect(
      new Set(
        [...firstPage.history.entries, ...secondPage.history.entries].map(
          (entry) => entry.visitId,
        ),
      ).size,
    ).toBe(ATTENDANCE_HISTORY_PAGE_SIZE + 2);
    expect(directPage.history.page).toBe(1);
    expect(directPage.history.entries).toHaveLength(
      ATTENDANCE_HISTORY_PAGE_SIZE,
    );
    expect(defaultPage.history.page).toBe(1);
    expect(defaultPage.history.entries).toHaveLength(
      ATTENDANCE_HISTORY_PAGE_SIZE,
    );

    const secondPageFirstEntry = secondPage.history.entries.at(0);

    expect(secondPageFirstEntry).toBeDefined();

    if (secondPageFirstEntry === undefined) {
      return;
    }

    const previousPage = await getManagerAttendanceData(
      prisma,
      lab.id,
      1,
      firstPage.history.through,
      {
        checkedInAt: secondPageFirstEntry.checkedInAt,
        direction: 'previous',
        visitId: secondPageFirstEntry.visitId,
      },
      readAt,
    );

    expect(previousPage.history.entries.map((entry) => entry.visitId)).toEqual(
      firstPage.history.entries.map((entry) => entry.visitId),
    );
    expect(previousPage.history).toMatchObject({
      hasNext: true,
      hasPrevious: false,
      page: 1,
    });

    const lateCheckIn = new Date(firstPage.history.through.getTime() - 1);

    await prisma.attendanceVisit.create({
      data: {
        checkedInAt: lateCheckIn,
        checkedOutAt: new Date(lateCheckIn.getTime() + 30_000),
        checkOutMethod: 'QR',
        labId: lab.id,
        userId: attendee.id,
      },
    });

    const stableSecondPage = await getManagerAttendanceData(
      prisma,
      lab.id,
      2,
      firstPage.history.through,
      {
        checkedInAt: firstPageLastEntry.checkedInAt,
        direction: 'next',
        visitId: firstPageLastEntry.visitId,
      },
      readAt,
    );

    expect(
      stableSecondPage.history.entries.map((entry) => entry.visitId),
    ).toEqual(secondPage.history.entries.map((entry) => entry.visitId));
    expect(
      new Set(
        [...firstPage.history.entries, ...stableSecondPage.history.entries].map(
          (entry) => entry.visitId,
        ),
      ).size,
    ).toBe(
      firstPage.history.entries.length +
        stableSecondPage.history.entries.length,
    );
  });
});
