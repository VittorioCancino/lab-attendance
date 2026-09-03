import { createHash } from 'node:crypto';

import { argon2id, hash } from 'argon2';

import { createPrismaClient } from '@/lib/db/client';
import {
  e2eAccounts,
  e2eInvitationToken,
  e2eLabId,
} from '@/tests/e2e/fixtures';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required for the E2E seed.');
}

const e2eDatabaseUrl = databaseUrl;
const parsedDatabaseUrl = new URL(e2eDatabaseUrl);

if (parsedDatabaseUrl.pathname !== '/lab_attendance_e2e') {
  throw new Error('The E2E seed only accepts the lab_attendance_e2e database.');
}

function selectSafeTimezone(now: Date): string {
  const candidates = [
    'Etc/UTC',
    'America/Santiago',
    'Pacific/Honolulu',
    'Asia/Tokyo',
  ];

  for (const timezone of candidates) {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      timeZone: timezone,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    const localMinute = hour * 60 + minute;

    if (localMinute >= 30 && localMinute < 1410) {
      return timezone;
    }
  }

  throw new Error('Could not select a safe E2E timezone.');
}

async function main(): Promise<void> {
  const prisma = createPrismaClient(e2eDatabaseUrl);

  try {
    const now = new Date();
    const [
      administratorPasswordHash,
      managerPasswordHash,
      attendeePasswordHash,
    ] = await Promise.all([
      hash(e2eAccounts.administrator.password, { type: argon2id }),
      hash(e2eAccounts.manager.password, { type: argon2id }),
      hash(e2eAccounts.attendee.password, { type: argon2id }),
    ]);

    await prisma.$transaction(async (transaction) => {
      await transaction.attendanceCronState.deleteMany();
      await transaction.rateLimitBucket.deleteMany();
      await transaction.attendanceScan.deleteMany();
      await transaction.attendanceVisit.deleteMany();
      await transaction.qrDisplaySession.deleteMany();
      await transaction.qrDisplayActivation.deleteMany();
      await transaction.labInvitation.deleteMany();
      await transaction.labMembership.deleteMany();
      await transaction.lab.deleteMany();
      await transaction.user.deleteMany();

      await transaction.lab.create({
        data: {
          attendanceClosesAtMinute: 1439,
          attendanceOpensAtMinute: 0,
          id: e2eLabId,
          name: 'Laboratorio E2E',
          slug: 'e2e-lab',
          timezone: selectSafeTimezone(now),
        },
      });
      const [, manager, attendee] = await Promise.all([
        transaction.user.create({
          data: {
            email: e2eAccounts.administrator.email,
            isGlobalAdmin: true,
            name: e2eAccounts.administrator.name,
            passwordHash: administratorPasswordHash,
          },
        }),
        transaction.user.create({
          data: {
            email: e2eAccounts.manager.email,
            name: e2eAccounts.manager.name,
            passwordHash: managerPasswordHash,
          },
        }),
        transaction.user.create({
          data: {
            email: e2eAccounts.attendee.email,
            name: e2eAccounts.attendee.name,
            passwordHash: attendeePasswordHash,
          },
        }),
      ]);

      await transaction.labMembership.createMany({
        data: [
          { labId: e2eLabId, role: 'MANAGER', userId: manager.id },
          { labId: e2eLabId, role: 'ATTENDEE', userId: attendee.id },
        ],
      });
      await transaction.labInvitation.create({
        data: {
          email: e2eAccounts.invitedAttendee.email,
          expiresAt: new Date(now.getTime() + 60 * 60_000),
          invitedByUserId: manager.id,
          labId: e2eLabId,
          name: e2eAccounts.invitedAttendee.name,
          role: 'ATTENDEE',
          tokenHash: createHash('sha256')
            .update(e2eInvitationToken)
            .digest('hex'),
        },
      });
      await transaction.attendanceCronState.create({
        data: { labId: e2eLabId, lastSucceededAt: now },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  process.stderr.write('E2E database seeding failed.\n');
  process.exitCode = 1;
});
