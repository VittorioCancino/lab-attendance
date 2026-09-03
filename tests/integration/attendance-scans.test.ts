import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LabMembershipRole } from '@/app/generated/prisma/client';
import {
  getAttendanceScanPreview,
  recordAttendanceScan,
} from '@/lib/db/attendance-scans';
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
      timezone: options?.timezone ?? 'America/Santiago',
    },
  });
}

async function createMember(
  email: string,
  labId: string,
  role: LabMembershipRole,
) {
  const user = await prisma.user.create({
    data: {
      email,
      name: email,
      passwordHash: 'not-used-in-attendance-scan-tests',
    },
  });

  await prisma.labMembership.create({
    data: { labId, role, userId: user.id },
  });

  return user;
}

describe('attendance scan lifecycle', () => {
  it('checks in, preserves a duplicate result, and checks out on a new window', async () => {
    const lab = await createLab('first-lab');
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );
    const checkedInAt = new Date('2026-08-28T12:00:00.000Z');
    const checkedOutAt = new Date('2026-08-28T14:00:00.000Z');

    await expect(
      getAttendanceScanPreview(prisma, {
        labId: lab.id,
        now: checkedInAt,
        userId: attendee.id,
      }),
    ).resolves.toMatchObject({
      checkInAllowed: true,
      checkedInAt: null,
      nextAction: 'CHECK_IN',
      visitId: null,
    });

    const checkIn = await recordAttendanceScan(prisma, {
      expectedAction: 'CHECK_IN',
      expectedVisitId: null,
      labId: lab.id,
      now: checkedInAt,
      qrWindow: 100,
      userId: attendee.id,
    });

    expect(checkIn).toMatchObject({
      action: 'CHECK_IN',
      duplicate: false,
      occurredAt: checkedInAt,
      ok: true,
    });
    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
        labId: lab.id,
        now: new Date(checkedInAt.getTime() + 30_000),
        qrWindow: 100,
        userId: attendee.id,
      }),
    ).resolves.toMatchObject({
      action: 'CHECK_IN',
      duplicate: true,
      occurredAt: checkedInAt,
      ok: true,
    });
    await expect(
      getAttendanceScanPreview(prisma, {
        labId: lab.id,
        now: checkedOutAt,
        userId: attendee.id,
      }),
    ).resolves.toMatchObject({ checkedInAt, nextAction: 'CHECK_OUT' });

    if (!checkIn.ok) {
      throw new Error('Expected check-in to succeed.');
    }

    const checkOut = await recordAttendanceScan(prisma, {
      expectedAction: 'CHECK_OUT',
      expectedVisitId: checkIn.visitId,
      labId: lab.id,
      now: checkedOutAt,
      qrWindow: 101,
      userId: attendee.id,
    });

    expect(checkOut).toMatchObject({
      action: 'CHECK_OUT',
      duplicate: false,
      occurredAt: checkedOutAt,
      ok: true,
    });
    await expect(
      prisma.attendanceVisit.findFirstOrThrow(),
    ).resolves.toMatchObject({
      checkedInAt,
      checkedOutAt,
      labId: lab.id,
      userId: attendee.id,
    });
    await expect(prisma.attendanceScan.count()).resolves.toBe(2);
    await expect(
      getAttendanceScanPreview(prisma, {
        labId: lab.id,
        now: checkedOutAt,
        userId: attendee.id,
      }),
    ).resolves.toMatchObject({ checkedInAt: null, nextAction: 'CHECK_IN' });
  });

  it('enforces the half-open interval and closes visits at the exact cutoff', async () => {
    const lab = await createLab('first-lab', { timezone: 'Etc/UTC' });
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );
    const beforeOpening = new Date('2026-08-28T06:59:59.999Z');
    const opening = new Date('2026-08-28T07:00:00.000Z');
    const closing = new Date('2026-08-28T18:00:00.000Z');

    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
        labId: lab.id,
        now: beforeOpening,
        qrWindow: 150,
        userId: attendee.id,
      }),
    ).resolves.toEqual({ ok: false, reason: 'CHECK_IN_CLOSED' });

    const checkIn = await recordAttendanceScan(prisma, {
      expectedAction: 'CHECK_IN',
      expectedVisitId: null,
      labId: lab.id,
      now: opening,
      qrWindow: 151,
      userId: attendee.id,
    });

    expect(checkIn).toMatchObject({ action: 'CHECK_IN', ok: true });

    if (!checkIn.ok) {
      throw new Error('Expected check-in to succeed.');
    }

    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_OUT',
        expectedVisitId: checkIn.visitId,
        labId: lab.id,
        now: closing,
        qrWindow: 151,
        userId: attendee.id,
      }),
    ).resolves.toMatchObject({
      action: 'CHECK_IN',
      duplicate: true,
      ok: true,
    });
    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_OUT',
        expectedVisitId: checkIn.visitId,
        labId: lab.id,
        now: closing,
        qrWindow: 152,
        userId: attendee.id,
      }),
    ).resolves.toEqual({ ok: false, reason: 'STATE_CHANGED' });
    await expect(
      prisma.attendanceVisit.findUniqueOrThrow({
        where: { id: checkIn.visitId },
      }),
    ).resolves.toMatchObject({
      checkedOutAt: closing,
      checkOutManagerUserId: null,
      checkOutMethod: 'SYSTEM',
    });
    await expect(prisma.attendanceScan.count()).resolves.toBe(1);
  });

  it('allows an explicit checkout before opening when a visit remains open', async () => {
    const lab = await createLab('first-lab', { timezone: 'Etc/UTC' });
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );
    const visit = await prisma.attendanceVisit.create({
      data: {
        checkedInAt: new Date('2026-08-28T06:00:00.000Z'),
        labId: lab.id,
        userId: attendee.id,
      },
    });
    const checkedOutAt = new Date('2026-08-28T06:30:00.000Z');

    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_OUT',
        expectedVisitId: visit.id,
        labId: lab.id,
        now: checkedOutAt,
        qrWindow: 160,
        userId: attendee.id,
      }),
    ).resolves.toMatchObject({
      action: 'CHECK_OUT',
      occurredAt: checkedOutAt,
      ok: true,
    });
  });

  it('serializes concurrent consumption of the same QR window', async () => {
    const lab = await createLab('first-lab');
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );
    const scannedAt = new Date('2026-08-28T12:00:00.000Z');
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        recordAttendanceScan(prisma, {
          expectedAction: 'CHECK_IN',
          expectedVisitId: null,
          labId: lab.id,
          now: scannedAt,
          qrWindow: 200,
          userId: attendee.id,
        }),
      ),
    );
    const successes = results.filter((result) => result.ok);

    expect(successes).toHaveLength(5);
    expect(successes.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(new Set(successes.map((result) => result.scanId)).size).toBe(1);
    expect(successes.every((result) => result.action === 'CHECK_IN')).toBe(
      true,
    );
    await expect(prisma.attendanceVisit.count()).resolves.toBe(1);
    await expect(prisma.attendanceScan.count()).resolves.toBe(1);
  });

  it('does not reverse stale intent from adjacent concurrent windows', async () => {
    const lab = await createLab('first-lab');
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );
    const originalCheckIn = new Date('2026-08-28T10:00:00.000Z');

    const originalVisit = await prisma.attendanceVisit.create({
      data: {
        checkedInAt: originalCheckIn,
        labId: lab.id,
        userId: attendee.id,
      },
    });

    const results = await Promise.all([
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_OUT',
        expectedVisitId: originalVisit.id,
        labId: lab.id,
        now: new Date('2026-08-28T12:00:00.000Z'),
        qrWindow: 201,
        userId: attendee.id,
      }),
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_OUT',
        expectedVisitId: originalVisit.id,
        labId: lab.id,
        now: new Date('2026-08-28T12:00:00.000Z'),
        qrWindow: 202,
        userId: attendee.id,
      }),
    ]);
    const visits = await prisma.attendanceVisit.findMany({
      where: { labId: lab.id, userId: attendee.id },
      orderBy: { checkedInAt: 'asc' },
    });

    expect(results.filter((entry) => entry.ok)).toHaveLength(1);
    expect(results.filter((entry) => !entry.ok)).toEqual([
      { ok: false, reason: 'STATE_CHANGED' },
    ]);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({
      checkedInAt: originalCheckIn,
    });
    expect(visits[0]?.checkedOutAt).not.toBeNull();
    expect(visits[0]?.checkOutMethod).toBe('QR');
  });

  it('rejects managers and inactive attendee access without creating records', async () => {
    const lab = await createLab('first-lab');
    const otherLab = await createLab('second-lab');
    const attendee = await createMember(
      'attendee@test.local',
      lab.id,
      LabMembershipRole.ATTENDEE,
    );
    const manager = await createMember(
      'manager@test.local',
      lab.id,
      LabMembershipRole.MANAGER,
    );

    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
        labId: otherLab.id,
        now: new Date('2026-08-28T12:00:00.000Z'),
        qrWindow: 300,
        userId: attendee.id,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
        labId: lab.id,
        now: new Date('2026-08-28T12:00:00.000Z'),
        qrWindow: 300,
        userId: manager.id,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });

    await prisma.labMembership.update({
      where: { labId_userId: { labId: lab.id, userId: attendee.id } },
      data: { isActive: false },
    });
    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
        labId: lab.id,
        now: new Date('2026-08-28T12:00:00.000Z'),
        qrWindow: 300,
        userId: attendee.id,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });

    await prisma.labMembership.update({
      where: { labId_userId: { labId: lab.id, userId: attendee.id } },
      data: { isActive: true },
    });
    await prisma.user.update({
      where: { id: attendee.id },
      data: { isActive: false },
    });
    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
        labId: lab.id,
        now: new Date('2026-08-28T12:00:00.000Z'),
        qrWindow: 300,
        userId: attendee.id,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });

    await prisma.user.update({
      where: { id: attendee.id },
      data: { isActive: true },
    });
    await prisma.lab.update({
      where: { id: lab.id },
      data: { isActive: false },
    });
    await expect(
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
        labId: lab.id,
        now: new Date('2026-08-28T12:00:00.000Z'),
        qrWindow: 300,
        userId: attendee.id,
      }),
    ).resolves.toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
    await expect(
      getAttendanceScanPreview(prisma, {
        labId: lab.id,
        userId: attendee.id,
      }),
    ).resolves.toBeNull();
    await expect(prisma.attendanceVisit.count()).resolves.toBe(0);
    await expect(prisma.attendanceScan.count()).resolves.toBe(0);
  });

  it('isolates the same attendee and QR window between labs', async () => {
    const firstLab = await createLab('first-lab');
    const secondLab = await createLab('second-lab');
    const attendee = await prisma.user.create({
      data: {
        email: 'attendee@test.local',
        name: 'Persona asistente',
        passwordHash: 'not-used-in-attendance-scan-tests',
        memberships: {
          create: [
            { labId: firstLab.id, role: LabMembershipRole.ATTENDEE },
            { labId: secondLab.id, role: LabMembershipRole.ATTENDEE },
          ],
        },
      },
    });
    const [firstResult, secondResult] = await Promise.all([
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
        labId: firstLab.id,
        now: new Date('2026-08-28T12:00:00.000Z'),
        qrWindow: 400,
        userId: attendee.id,
      }),
      recordAttendanceScan(prisma, {
        expectedAction: 'CHECK_IN',
        expectedVisitId: null,
        labId: secondLab.id,
        now: new Date('2026-08-28T12:00:00.000Z'),
        qrWindow: 400,
        userId: attendee.id,
      }),
    ]);

    expect(firstResult).toMatchObject({ action: 'CHECK_IN', ok: true });
    expect(secondResult).toMatchObject({ action: 'CHECK_IN', ok: true });
    await expect(
      prisma.attendanceVisit.count({
        where: { labId: firstLab.id, userId: attendee.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.attendanceVisit.count({
        where: { labId: secondLab.id, userId: attendee.id },
      }),
    ).resolves.toBe(1);
  });
});
