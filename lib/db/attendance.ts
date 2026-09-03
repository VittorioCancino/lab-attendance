import 'server-only';

import {
  Prisma,
  type AttendanceMethod,
  type PrismaClient,
} from '@/app/generated/prisma/client';
import { reconcileLabAttendance } from '@/lib/db/attendance-policy';

export const ATTENDANCE_HISTORY_PAGE_SIZE = 25;

export interface CurrentPresenceEntry {
  checkInManagerName: string | null;
  checkInMethod: AttendanceMethod;
  checkedInAt: Date;
  email: string;
  isAccountActive: boolean;
  isMembershipActive: boolean;
  name: string;
  userId: string;
  visitId: string;
}

export interface RegisteredAttendee {
  email: string;
  isAccountActive: boolean;
  isMembershipActive: boolean;
  name: string;
  registeredAt: Date;
  userId: string;
}

export interface AttendanceHistoryEntry {
  checkInManagerName: string | null;
  checkInMethod: AttendanceMethod;
  checkOutManagerName: string | null;
  checkOutMethod: AttendanceMethod | null;
  checkedInAt: Date;
  checkedOutAt: Date | null;
  email: string;
  name: string;
  userId: string;
  visitId: string;
}

export interface AttendanceHistoryPage {
  entries: AttendanceHistoryEntry[];
  hasNext: boolean;
  hasPrevious: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  through: Date;
}

export interface AttendanceHistoryCursor {
  checkedInAt: Date;
  direction: 'next' | 'previous';
  visitId: string;
}

export interface ManagerAttendanceData {
  attendanceSchedule: {
    closesAtMinute: number;
    isOpen: boolean;
    opensAtMinute: number;
  };
  currentPresence: CurrentPresenceEntry[];
  history: AttendanceHistoryPage;
  readAt: Date;
  registeredAttendees: RegisteredAttendee[];
}

export async function getManagerAttendanceData(
  client: PrismaClient,
  labId: string,
  requestedPage: number,
  requestedThrough?: Date,
  requestedCursor?: AttendanceHistoryCursor,
  now?: Date,
): Promise<ManagerAttendanceData> {
  const attendancePolicy = await reconcileLabAttendance(client, {
    labId,
    now,
  });

  if (attendancePolicy === null) {
    throw new Error('The configured lab is not available.');
  }

  const readAt = attendancePolicy.now;
  const maximumPage = Math.floor(
    Number.MAX_SAFE_INTEGER / ATTENDANCE_HISTORY_PAGE_SIZE,
  );
  const safePage =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, maximumPage)
      : 1;
  const historyThrough =
    requestedThrough !== undefined &&
    !Number.isNaN(requestedThrough.getTime()) &&
    requestedThrough <= readAt
      ? requestedThrough
      : readAt;
  const attendeeVisitScope = {
    labId,
    membership: { role: 'ATTENDEE' },
  } satisfies Prisma.AttendanceVisitWhereInput;
  const historyScope = {
    ...attendeeVisitScope,
    checkedInAt: { lte: historyThrough },
  } satisfies Prisma.AttendanceVisitWhereInput;

  return client.$transaction(
    async (transaction) => {
      // Prisma 7 fans out sibling relation reads on one transaction connection.
      // Load scalar visits and their related records sequentially instead.
      const currentPresence = await transaction.attendanceVisit.findMany({
        where: { ...attendeeVisitScope, checkedOutAt: null },
        orderBy: [{ checkedInAt: 'asc' }, { id: 'asc' }],
        select: {
          checkInManagerUserId: true,
          checkInMethod: true,
          checkedInAt: true,
          id: true,
          userId: true,
        },
      });
      const registeredAttendees = await transaction.labMembership.findMany({
        where: { labId, role: 'ATTENDEE' },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        select: {
          createdAt: true,
          isActive: true,
          user: {
            select: {
              email: true,
              isActive: true,
              name: true,
            },
          },
          userId: true,
        },
      });
      const totalCount = await transaction.attendanceVisit.count({
        where: historyScope,
      });
      const totalPages = Math.max(
        1,
        Math.ceil(totalCount / ATTENDANCE_HISTORY_PAGE_SIZE),
      );
      const page =
        requestedCursor === undefined ? 1 : Math.min(safePage, totalPages);
      const isPreviousPage = requestedCursor?.direction === 'previous';
      const cursorScope =
        requestedCursor === undefined
          ? undefined
          : ({
              OR: [
                {
                  checkedInAt: isPreviousPage
                    ? { gt: requestedCursor.checkedInAt }
                    : { lt: requestedCursor.checkedInAt },
                },
                {
                  checkedInAt: requestedCursor.checkedInAt,
                  id: isPreviousPage
                    ? { gt: requestedCursor.visitId }
                    : { lt: requestedCursor.visitId },
                },
              ],
            } satisfies Prisma.AttendanceVisitWhereInput);
      const rawHistoryEntries = await transaction.attendanceVisit.findMany({
        where: { ...historyScope, ...cursorScope },
        orderBy: [
          { checkedInAt: isPreviousPage ? 'asc' : 'desc' },
          { id: isPreviousPage ? 'asc' : 'desc' },
        ],
        take: ATTENDANCE_HISTORY_PAGE_SIZE + 1,
        select: {
          checkInManagerUserId: true,
          checkInMethod: true,
          checkOutManagerUserId: true,
          checkOutMethod: true,
          checkedInAt: true,
          checkedOutAt: true,
          id: true,
          userId: true,
        },
      });
      const hasExtraEntry =
        rawHistoryEntries.length > ATTENDANCE_HISTORY_PAGE_SIZE;
      const pageHistoryEntries = rawHistoryEntries.slice(
        0,
        ATTENDANCE_HISTORY_PAGE_SIZE,
      );
      const historyEntries = isPreviousPage
        ? pageHistoryEntries.reverse()
        : pageHistoryEntries;
      const managerUserIds = [
        ...currentPresence.map((visit) => visit.checkInManagerUserId),
        ...historyEntries.flatMap((visit) => [
          visit.checkInManagerUserId,
          visit.checkOutManagerUserId,
        ]),
      ].filter((userId): userId is string => userId !== null);
      const managerMemberships =
        managerUserIds.length === 0
          ? []
          : await transaction.labMembership.findMany({
              where: { labId, userId: { in: managerUserIds } },
              select: {
                user: { select: { name: true } },
                userId: true,
              },
            });
      const attendeesByUserId = new Map(
        registeredAttendees.map((membership) => [
          membership.userId,
          membership,
        ]),
      );
      const managerNamesByUserId = new Map(
        managerMemberships.map((membership) => [
          membership.userId,
          membership.user.name,
        ]),
      );
      const getAttendee = (userId: string) => {
        const attendee = attendeesByUserId.get(userId);

        if (attendee === undefined) {
          throw new Error('Attendance visit has no attendee membership.');
        }

        return attendee;
      };
      const getManagerName = (userId: string | null) =>
        userId === null ? null : (managerNamesByUserId.get(userId) ?? null);

      return {
        attendanceSchedule: {
          closesAtMinute: attendancePolicy.attendanceClosesAtMinute,
          isOpen: attendancePolicy.isOpen,
          opensAtMinute: attendancePolicy.attendanceOpensAtMinute,
        },
        currentPresence: currentPresence.map((visit) => {
          const attendee = getAttendee(visit.userId);

          return {
            checkInManagerName: getManagerName(visit.checkInManagerUserId),
            checkInMethod: visit.checkInMethod,
            checkedInAt: visit.checkedInAt,
            email: attendee.user.email,
            isAccountActive: attendee.user.isActive,
            isMembershipActive: attendee.isActive,
            name: attendee.user.name,
            userId: visit.userId,
            visitId: visit.id,
          };
        }),
        history: {
          entries: historyEntries.map((visit) => {
            const attendee = getAttendee(visit.userId);

            return {
              checkInManagerName: getManagerName(visit.checkInManagerUserId),
              checkInMethod: visit.checkInMethod,
              checkOutManagerName: getManagerName(visit.checkOutManagerUserId),
              checkOutMethod: visit.checkOutMethod,
              checkedInAt: visit.checkedInAt,
              checkedOutAt: visit.checkedOutAt,
              email: attendee.user.email,
              name: attendee.user.name,
              userId: visit.userId,
              visitId: visit.id,
            };
          }),
          hasNext: requestedCursor?.direction === 'previous' || hasExtraEntry,
          hasPrevious:
            page > 1 &&
            (requestedCursor?.direction === 'next' ||
              (isPreviousPage && hasExtraEntry)),
          page,
          pageSize: ATTENDANCE_HISTORY_PAGE_SIZE,
          totalCount,
          totalPages,
          through: historyThrough,
        },
        readAt,
        registeredAttendees: registeredAttendees.map((membership) => ({
          email: membership.user.email,
          isAccountActive: membership.user.isActive,
          isMembershipActive: membership.isActive,
          name: membership.user.name,
          registeredAt: membership.createdAt,
          userId: membership.userId,
        })),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
