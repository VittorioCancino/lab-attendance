import 'server-only';

import {
  Prisma,
  type LabMembershipRole,
  type PrismaClient,
} from '@/app/generated/prisma/client';
import {
  generateDisplayActivationCode,
  generateDisplaySessionToken,
  hashDisplayActivationCode,
  hashDisplaySessionToken,
} from '@/lib/auth/qr-tokens';
import {
  DISPLAY_ACTIVATION_LIFETIME_MS,
  DISPLAY_SESSION_LIFETIME_MS,
} from '@/lib/const/qr';
import { formatDisplayActivationCode } from '@/lib/util/qr-code';

export type QrDisplayStatus = 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'REVOKED';

export interface QrDisplayRecord {
  activatedAt: Date | null;
  activationId: string;
  canRevoke: boolean;
  createdAt: Date;
  createdByName: string;
  expiresAt: Date;
  label: string;
  status: QrDisplayStatus;
}

export type CreateQrDisplayActivationResult =
  | {
      code: string;
      expiresAt: Date;
      ok: true;
    }
  | { ok: false; reason: 'NOT_AUTHORIZED' };

export type RedeemQrDisplayActivationResult =
  | {
      expiresAt: Date;
      label: string;
      ok: true;
      token: string;
    }
  | { ok: false };

export type RevokeQrDisplayResult = 'NOT_AUTHORIZED' | 'NOT_FOUND' | 'REVOKED';

interface RedeemableDisplayActivationRow {
  expiresAt: Date;
  id: string;
  isAccountActive: boolean;
  isLabActive: boolean;
  isMembershipActive: boolean;
  label: string;
  revokedAt: Date | null;
  role: LabMembershipRole;
  sessionId: string | null;
}

async function hasActiveManagerAccess(
  transaction: Prisma.TransactionClient,
  labId: string,
  userId: string,
): Promise<boolean> {
  const membership = await transaction.labMembership.findFirst({
    where: {
      isActive: true,
      lab: { isActive: true },
      labId,
      role: 'MANAGER',
      user: { isActive: true },
      userId,
    },
    select: { userId: true },
  });

  return membership !== null;
}

export async function createQrDisplayActivation(
  client: PrismaClient,
  input: {
    createdByUserId: string;
    label: string;
    labId: string;
    now?: Date;
    secret: string;
  },
): Promise<CreateQrDisplayActivationResult> {
  const now = input.now ?? new Date();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateDisplayActivationCode();
    const codeHash = hashDisplayActivationCode(input.secret, input.labId, code);

    try {
      const result = await client.$transaction(async (transaction) => {
        if (
          !(await hasActiveManagerAccess(
            transaction,
            input.labId,
            input.createdByUserId,
          ))
        ) {
          return { ok: false, reason: 'NOT_AUTHORIZED' } as const;
        }

        const expiresAt = new Date(
          now.getTime() + DISPLAY_ACTIVATION_LIFETIME_MS,
        );

        await transaction.qrDisplayActivation.create({
          data: {
            codeHash,
            createdAt: now,
            createdByUserId: input.createdByUserId,
            expiresAt,
            labId: input.labId,
            label: input.label,
          },
        });

        return {
          code: formatDisplayActivationCode(code),
          expiresAt,
          ok: true,
        } as const;
      });

      return result;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Could not allocate a display activation code.');
}

export async function listQrDisplays(
  client: PrismaClient,
  labId: string,
  now = new Date(),
): Promise<QrDisplayRecord[]> {
  const activations = await client.qrDisplayActivation.findMany({
    where: { labId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      createdAt: true,
      creatorMembership: {
        select: { user: { select: { name: true } } },
      },
      expiresAt: true,
      id: true,
      label: true,
      revokedAt: true,
      session: {
        select: {
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      },
    },
  });

  return activations.map((activation) => {
    const status: QrDisplayStatus = activation.session
      ? activation.session.revokedAt !== null
        ? 'REVOKED'
        : activation.session.expiresAt <= now
          ? 'EXPIRED'
          : 'ACTIVE'
      : activation.revokedAt !== null
        ? 'REVOKED'
        : activation.expiresAt <= now
          ? 'EXPIRED'
          : 'PENDING';

    return {
      activatedAt: activation.session?.createdAt ?? null,
      activationId: activation.id,
      canRevoke: status === 'ACTIVE' || status === 'PENDING',
      createdAt: activation.createdAt,
      createdByName: activation.creatorMembership.user.name,
      expiresAt: activation.session?.expiresAt ?? activation.expiresAt,
      label: activation.label,
      status,
    };
  });
}

export async function redeemQrDisplayActivation(
  client: PrismaClient,
  input: {
    code: string;
    labId: string;
    now?: Date;
    secret: string;
  },
): Promise<RedeemQrDisplayActivationResult> {
  const now = input.now ?? new Date();
  const codeHash = hashDisplayActivationCode(
    input.secret,
    input.labId,
    input.code,
  );
  const token = generateDisplaySessionToken();
  const tokenHash = hashDisplaySessionToken(input.secret, input.labId, token);

  try {
    return await client.$transaction(async (transaction) => {
      // One SQL statement avoids Prisma 7 relation fan-out on this locked
      // transaction connection while preserving the authorization snapshot.
      const activations = await transaction.$queryRaw<
        RedeemableDisplayActivationRow[]
      >(Prisma.sql`
        SELECT
          activation."id",
          activation."expiresAt",
          activation."label",
          activation."revokedAt",
          creator_membership."isActive" AS "isMembershipActive",
          creator_membership."role",
          creator."isActive" AS "isAccountActive",
          lab."isActive" AS "isLabActive",
          display_session."id" AS "sessionId"
        FROM "QrDisplayActivation" AS activation
        INNER JOIN "LabMembership" AS creator_membership
          ON creator_membership."labId" = activation."labId"
          AND creator_membership."userId" = activation."createdByUserId"
        INNER JOIN "User" AS creator
          ON creator."id" = creator_membership."userId"
        INNER JOIN "Lab" AS lab
          ON lab."id" = activation."labId"
        LEFT JOIN "QrDisplaySession" AS display_session
          ON display_session."labId" = activation."labId"
          AND display_session."activationId" = activation."id"
        WHERE activation."labId" = ${input.labId}::uuid
          AND activation."codeHash" = ${codeHash}
        FOR UPDATE OF activation
      `);
      const activation = activations.at(0);

      if (activation === undefined) {
        return { ok: false };
      }

      if (
        activation.revokedAt !== null ||
        activation.expiresAt <= now ||
        activation.sessionId !== null ||
        !activation.isMembershipActive ||
        activation.role !== 'MANAGER' ||
        !activation.isAccountActive ||
        !activation.isLabActive
      ) {
        return { ok: false };
      }

      const expiresAt = new Date(now.getTime() + DISPLAY_SESSION_LIFETIME_MS);

      await transaction.qrDisplaySession.create({
        data: {
          activationId: activation.id,
          createdAt: now,
          expiresAt,
          labId: input.labId,
          tokenHash,
        },
      });

      return {
        expiresAt,
        label: activation.label,
        ok: true,
        token,
      };
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { ok: false };
    }

    throw error;
  }
}

export async function getValidQrDisplaySession(
  client: PrismaClient,
  input: {
    labId: string;
    now?: Date;
    secret: string;
    token: string;
  },
): Promise<{ expiresAt: Date; label: string } | null> {
  const now = input.now ?? new Date();
  const tokenHash = hashDisplaySessionToken(
    input.secret,
    input.labId,
    input.token,
  );
  const session = await client.qrDisplaySession.findUnique({
    where: {
      labId_tokenHash: { labId: input.labId, tokenHash },
    },
    select: {
      activation: {
        select: {
          creatorMembership: {
            select: {
              isActive: true,
              lab: { select: { isActive: true } },
              role: true,
              user: { select: { isActive: true } },
            },
          },
          label: true,
          revokedAt: true,
        },
      },
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (session === null) {
    return null;
  }

  if (
    session.revokedAt !== null ||
    session.expiresAt <= now ||
    session.activation.revokedAt !== null ||
    !session.activation.creatorMembership.isActive ||
    session.activation.creatorMembership.role !== 'MANAGER' ||
    !session.activation.creatorMembership.user.isActive ||
    !session.activation.creatorMembership.lab.isActive
  ) {
    return null;
  }

  return {
    expiresAt: session.expiresAt,
    label: session.activation.label,
  };
}

export async function revokeQrDisplay(
  client: PrismaClient,
  input: {
    activationId: string;
    labId: string;
    managerUserId: string;
    now?: Date;
  },
): Promise<RevokeQrDisplayResult> {
  const now = input.now ?? new Date();

  return client.$transaction(async (transaction) => {
    if (
      !(await hasActiveManagerAccess(
        transaction,
        input.labId,
        input.managerUserId,
      ))
    ) {
      return 'NOT_AUTHORIZED';
    }

    const locked = await transaction.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT "id"
        FROM "QrDisplayActivation"
        WHERE "labId" = ${input.labId}::uuid
          AND "id" = ${input.activationId}::uuid
        FOR UPDATE
      `,
    );

    if (locked.length !== 1) {
      return 'NOT_FOUND';
    }

    const activation = await transaction.qrDisplayActivation.findUnique({
      where: {
        labId_id: { id: input.activationId, labId: input.labId },
      },
      select: {
        expiresAt: true,
        revokedAt: true,
        session: {
          select: { expiresAt: true, id: true, revokedAt: true },
        },
      },
    });

    if (activation === null) {
      return 'NOT_FOUND';
    }

    if (activation.session !== null) {
      if (
        activation.session.revokedAt !== null ||
        activation.session.expiresAt <= now
      ) {
        return 'NOT_FOUND';
      }

      const update = await transaction.qrDisplaySession.updateMany({
        where: {
          id: activation.session.id,
          labId: input.labId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedByUserId: input.managerUserId,
        },
      });

      return update.count === 1 ? 'REVOKED' : 'NOT_FOUND';
    }

    if (activation.revokedAt !== null || activation.expiresAt <= now) {
      return 'NOT_FOUND';
    }

    const update = await transaction.qrDisplayActivation.updateMany({
      where: {
        id: input.activationId,
        labId: input.labId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokedByUserId: input.managerUserId,
      },
    });

    return update.count === 1 ? 'REVOKED' : 'NOT_FOUND';
  });
}
