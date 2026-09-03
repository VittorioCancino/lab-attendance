import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LabMembershipRole } from '@/app/generated/prisma/client';
import { getManagerAttendanceData } from '@/lib/db/attendance';
import {
  recordManagerAttendance,
  updateAttendanceSchedule,
} from '@/lib/db/attendance-management';
import { reconcileLabAttendance } from '@/lib/db/attendance-policy';
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

async function createLab(
  slug: string,
  options?: {
    attendanceClosesAtMinute?: number;
    attendanceOpensAtMinute?: number;
    timezone?: string;
  },
) {
  return prisma.lab.create({
    data: {
      attendanceClosesAtMinute: options?.attendanceClosesAtMinute,
      attendanceOpensAtMinute: options?.attendanceOpensAtMinute,
      name: `Laboratorio ${slug}`,
      slug,
      timezone: options?.timezone ?? 'Etc/UTC',
    },
  });
}

async function createMember(
  email: string,
  labId: string,
  role: LabMembershipRole,
) {
  return prisma.user.create({
    data: {
      email,
      name: email,
      passwordHash: 'not-used-in-attendance-management-tests',
      memberships: { create: { labId, role } },
    },
  });
}

describe('manager attendance', () => {
  it('records attributable manual entry and exit with server time', async () => {
    const lab = await createLab('first-lab');
    const manager = await createMember(
      'manager@test.local',
      lab.id,
      LabMembershipRole.MANAGER,
    );
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );
    const checkedInAt = new Date('2026-09-02T08:00:00.000Z');
    const checkIn = await recordManagerAttendance(prisma, {
      action: 'CHECK_IN',
      attendeeUserId: attendee.id,
      labId: lab.id,
      managerUserId: manager.id,
      now: checkedInAt,
    });

    expect(checkIn).toMatchObject({
      action: 'CHECK_IN',
      occurredAt: checkedInAt,
      ok: true,
    });

    if (!checkIn.ok) {
      throw new Error('Expected manager check-in to succeed.');
    }

    await expect(
      prisma.attendanceVisit.findUniqueOrThrow({
        where: { id: checkIn.visitId },
      }),
    ).resolves.toMatchObject({
      checkInManagerUserId: manager.id,
      checkInMethod: 'MANAGER',
      checkedInAt,
      checkOutMethod: null,
    });

    await prisma.labMembership.update({
      where: { labId_userId: { labId: lab.id, userId: attendee.id } },
      data: { isActive: false },
    });
    await prisma.user.update({
      where: { id: attendee.id },
      data: { isActive: false },
    });

    const checkedOutAt = new Date('2026-09-02T10:00:00.000Z');

    await expect(
      recordManagerAttendance(prisma, {
        action: 'CHECK_OUT',
        attendeeUserId: attendee.id,
        expectedVisitId: checkIn.visitId,
        labId: lab.id,
        managerUserId: manager.id,
        now: checkedOutAt,
      }),
    ).resolves.toMatchObject({
      action: 'CHECK_OUT',
      occurredAt: checkedOutAt,
      ok: true,
    });
    await expect(
      prisma.attendanceVisit.findUniqueOrThrow({
        where: { id: checkIn.visitId },
      }),
    ).resolves.toMatchObject({
      checkedOutAt,
      checkOutManagerUserId: manager.id,
      checkOutMethod: 'MANAGER',
    });
    await expect(prisma.attendanceScan.count()).resolves.toBe(0);

    const attendance = await getManagerAttendanceData(
      prisma,
      lab.id,
      1,
      undefined,
      undefined,
      checkedOutAt,
    );

    expect(attendance.history.entries[0]).toMatchObject({
      checkInManagerName: manager.email,
      checkInMethod: 'MANAGER',
      checkOutManagerName: manager.email,
      checkOutMethod: 'MANAGER',
    });
  });

  it('blocks entry outside hours and never toggles stale requests', async () => {
    const lab = await createLab('first-lab');
    const manager = await createMember(
      'manager@test.local',
      lab.id,
      LabMembershipRole.MANAGER,
    );
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );

    await expect(
      recordManagerAttendance(prisma, {
        action: 'CHECK_IN',
        attendeeUserId: attendee.id,
        labId: lab.id,
        managerUserId: manager.id,
        now: new Date('2026-09-02T06:59:59.999Z'),
      }),
    ).resolves.toEqual({ ok: false, reason: 'CHECK_IN_CLOSED' });

    const first = await recordManagerAttendance(prisma, {
      action: 'CHECK_IN',
      attendeeUserId: attendee.id,
      labId: lab.id,
      managerUserId: manager.id,
      now: new Date('2026-09-02T07:00:00.000Z'),
    });

    expect(first).toMatchObject({ ok: true });
    await expect(
      recordManagerAttendance(prisma, {
        action: 'CHECK_IN',
        attendeeUserId: attendee.id,
        labId: lab.id,
        managerUserId: manager.id,
        now: new Date('2026-09-02T07:01:00.000Z'),
      }),
    ).resolves.toEqual({ ok: false, reason: 'STATE_CHANGED' });
    await expect(prisma.attendanceVisit.count()).resolves.toBe(1);
  });

  it('rejects attendee actors and cross-lab managers', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const attendee = await createMember(
      'attendee@test.local',
      firstLab.id,
      LabMembershipRole.ATTENDEE,
    );
    const otherManager = await createMember(
      'manager@test.local',
      secondLab.id,
      LabMembershipRole.MANAGER,
    );
    const now = new Date('2026-09-02T08:00:00.000Z');

    await expect(
      recordManagerAttendance(prisma, {
        action: 'CHECK_IN',
        attendeeUserId: attendee.id,
        labId: firstLab.id,
        managerUserId: attendee.id,
        now,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
    await expect(
      recordManagerAttendance(prisma, {
        action: 'CHECK_IN',
        attendeeUserId: attendee.id,
        labId: firstLab.id,
        managerUserId: otherManager.id,
        now,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
    await expect(prisma.attendanceVisit.count()).resolves.toBe(0);
  });
});

describe('attendance schedule and automatic closure', () => {
  it('fails closed when a DST gap inverts the resolved daily interval', async () => {
    const lab = await createLab('dst-lab', {
      attendanceClosesAtMinute: 60,
      attendanceOpensAtMinute: 30,
      timezone: 'America/Santiago',
    });
    const result = await reconcileLabAttendance(prisma, {
      labId: lab.id,
      now: new Date('2026-09-06T04:15:00.000Z'),
    });

    expect(result).toMatchObject({ closedVisitCount: 0, isOpen: false });
    expect(result).not.toBeNull();

    if (result !== null) {
      expect(result.opensAt > result.closesAt).toBe(true);
    }
  });

  it('applies an elapsed closing time immediately without backdating', async () => {
    const lab = await createLab('first-lab');
    const manager = await createMember(
      'manager@test.local',
      lab.id,
      LabMembershipRole.MANAGER,
    );
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );
    const visit = await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-09-02T12:00:00.000Z'),
        labId: lab.id,
        userId: attendee.id,
      },
    });
    const changedAt = new Date('2026-09-02T17:00:00.000Z');

    await expect(
      updateAttendanceSchedule(prisma, {
        attendanceClosesAtMinute: 16 * 60,
        attendanceOpensAtMinute: 7 * 60,
        expectedClosesAtMinute: 18 * 60,
        expectedOpensAtMinute: 7 * 60,
        labId: lab.id,
        managerUserId: manager.id,
        now: changedAt,
      }),
    ).resolves.toMatchObject({ closedVisitCount: 1, ok: true });
    await expect(
      prisma.attendanceVisit.findUniqueOrThrow({ where: { id: visit.id } }),
    ).resolves.toMatchObject({
      checkedOutAt: changedAt,
      checkOutMethod: 'SYSTEM',
    });
    await expect(
      updateAttendanceSchedule(prisma, {
        attendanceClosesAtMinute: 20 * 60,
        attendanceOpensAtMinute: 7 * 60,
        expectedClosesAtMinute: 18 * 60,
        expectedOpensAtMinute: 7 * 60,
        labId: lab.id,
        managerUserId: manager.id,
        now: new Date('2026-09-02T17:01:00.000Z'),
      }),
    ).resolves.toEqual({ ok: false, reason: 'STATE_CHANGED' });
    await expect(
      prisma.lab.findUniqueOrThrow({ where: { id: lab.id } }),
    ).resolves.toMatchObject({ attendanceClosesAtMinute: 16 * 60 });
  });

  it('reconciles the old schedule before extending hours', async () => {
    const lab = await createLab('first-lab');
    const manager = await createMember(
      'manager@test.local',
      lab.id,
      LabMembershipRole.MANAGER,
    );
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );
    const visit = await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-09-02T12:00:00.000Z'),
        labId: lab.id,
        userId: attendee.id,
      },
    });

    await updateAttendanceSchedule(prisma, {
      attendanceClosesAtMinute: 20 * 60,
      attendanceOpensAtMinute: 7 * 60,
      expectedClosesAtMinute: 18 * 60,
      expectedOpensAtMinute: 7 * 60,
      labId: lab.id,
      managerUserId: manager.id,
      now: new Date('2026-09-02T19:00:00.000Z'),
    });

    await expect(
      prisma.attendanceVisit.findUniqueOrThrow({ where: { id: visit.id } }),
    ).resolves.toMatchObject({
      checkedOutAt: new Date('2026-09-02T18:00:00.000Z'),
      checkOutMethod: 'SYSTEM',
    });
  });

  it('reconciles only the trusted lab and is idempotent', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const firstAttendee = await createMember(
      'first-attendee@test.local',
      firstLab.id,
      LabMembershipRole.ATTENDEE,
    );
    const secondAttendee = await createMember(
      'second-attendee@test.local',
      secondLab.id,
      LabMembershipRole.ATTENDEE,
    );

    await prisma.attendanceVisit.createMany({
      data: [
        {
          checkedInAt: new Date('2026-09-02T12:00:00.000Z'),
          labId: firstLab.id,
          userId: firstAttendee.id,
        },
        {
          checkedInAt: new Date('2026-09-02T12:00:00.000Z'),
          labId: secondLab.id,
          userId: secondAttendee.id,
        },
      ],
    });
    const now = new Date('2026-09-02T18:00:00.000Z');

    await expect(
      reconcileLabAttendance(prisma, { labId: firstLab.id, now }),
    ).resolves.toMatchObject({ closedVisitCount: 1, isOpen: false });
    await expect(
      reconcileLabAttendance(prisma, { labId: firstLab.id, now }),
    ).resolves.toMatchObject({ closedVisitCount: 0, isOpen: false });
    await expect(
      prisma.attendanceVisit.count({
        where: { checkedOutAt: null, labId: secondLab.id },
      }),
    ).resolves.toBe(1);
  });
});
