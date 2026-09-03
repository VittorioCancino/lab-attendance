-- CreateEnum
CREATE TYPE "AttendanceScanAction" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateTable
CREATE TABLE "QrDisplayActivation" (
    "id" UUID NOT NULL,
    "labId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "revokedByUserId" UUID,
    "label" VARCHAR(80) NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrDisplayActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrDisplaySession" (
    "id" UUID NOT NULL,
    "labId" UUID NOT NULL,
    "activationId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrDisplaySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceScan" (
    "id" UUID NOT NULL,
    "labId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "qrWindow" INTEGER NOT NULL,
    "action" "AttendanceScanAction" NOT NULL,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QrDisplayActivation_labId_expiresAt_idx" ON "QrDisplayActivation"("labId", "expiresAt");

-- CreateIndex
CREATE INDEX "QrDisplayActivation_labId_createdByUserId_idx" ON "QrDisplayActivation"("labId", "createdByUserId");

-- CreateIndex
CREATE INDEX "QrDisplayActivation_labId_revokedByUserId_idx" ON "QrDisplayActivation"("labId", "revokedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "QrDisplayActivation_labId_id_key" ON "QrDisplayActivation"("labId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "QrDisplayActivation_labId_codeHash_key" ON "QrDisplayActivation"("labId", "codeHash");

-- CreateIndex
CREATE INDEX "QrDisplaySession_labId_revokedAt_expiresAt_idx" ON "QrDisplaySession"("labId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "QrDisplaySession_labId_revokedByUserId_idx" ON "QrDisplaySession"("labId", "revokedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "QrDisplaySession_labId_activationId_key" ON "QrDisplaySession"("labId", "activationId");

-- CreateIndex
CREATE UNIQUE INDEX "QrDisplaySession_labId_tokenHash_key" ON "QrDisplaySession"("labId", "tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceScan_labId_userId_qrWindow_key" ON "AttendanceScan"("labId", "userId", "qrWindow");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceScan_labId_userId_visitId_action_key" ON "AttendanceScan"("labId", "userId", "visitId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceVisit_labId_userId_id_key" ON "AttendanceVisit"("labId", "userId", "id");

-- AddForeignKey
ALTER TABLE "QrDisplayActivation" ADD CONSTRAINT "QrDisplayActivation_labId_createdByUserId_fkey" FOREIGN KEY ("labId", "createdByUserId") REFERENCES "LabMembership"("labId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrDisplayActivation" ADD CONSTRAINT "QrDisplayActivation_labId_revokedByUserId_fkey" FOREIGN KEY ("labId", "revokedByUserId") REFERENCES "LabMembership"("labId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrDisplaySession" ADD CONSTRAINT "QrDisplaySession_labId_activationId_fkey" FOREIGN KEY ("labId", "activationId") REFERENCES "QrDisplayActivation"("labId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrDisplaySession" ADD CONSTRAINT "QrDisplaySession_labId_revokedByUserId_fkey" FOREIGN KEY ("labId", "revokedByUserId") REFERENCES "LabMembership"("labId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceScan" ADD CONSTRAINT "AttendanceScan_labId_userId_visitId_fkey" FOREIGN KEY ("labId", "userId", "visitId") REFERENCES "AttendanceVisit"("labId", "userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "QrDisplayActivation"
ADD CONSTRAINT "QrDisplayActivation_label_normalized_check"
CHECK ("label" = btrim("label") AND char_length("label") > 0);

-- AddCheckConstraint
ALTER TABLE "QrDisplayActivation"
ADD CONSTRAINT "QrDisplayActivation_code_hash_check"
CHECK ("codeHash" ~ '^[0-9a-f]{64}$');

-- AddCheckConstraint
ALTER TABLE "QrDisplayActivation"
ADD CONSTRAINT "QrDisplayActivation_lifetime_check"
CHECK (
    "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '10 minutes'
);

-- AddCheckConstraint
ALTER TABLE "QrDisplayActivation"
ADD CONSTRAINT "QrDisplayActivation_revocation_state_check"
CHECK (
    ("revokedAt" IS NULL AND "revokedByUserId" IS NULL)
    OR (
        "revokedAt" IS NOT NULL
        AND "revokedByUserId" IS NOT NULL
        AND "revokedAt" >= "createdAt"
        AND "revokedAt" <= "expiresAt"
    )
);

-- AddCheckConstraint
ALTER TABLE "QrDisplaySession"
ADD CONSTRAINT "QrDisplaySession_token_hash_check"
CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

-- AddCheckConstraint
ALTER TABLE "QrDisplaySession"
ADD CONSTRAINT "QrDisplaySession_lifetime_check"
CHECK (
    "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '12 hours'
);

-- AddCheckConstraint
ALTER TABLE "QrDisplaySession"
ADD CONSTRAINT "QrDisplaySession_revocation_state_check"
CHECK (
    ("revokedAt" IS NULL AND "revokedByUserId" IS NULL)
    OR (
        "revokedAt" IS NOT NULL
        AND "revokedByUserId" IS NOT NULL
        AND "revokedAt" >= "createdAt"
        AND "revokedAt" <= "expiresAt"
    )
);

-- AddCheckConstraint
ALTER TABLE "AttendanceScan"
ADD CONSTRAINT "AttendanceScan_qr_window_check"
CHECK ("qrWindow" >= 0);
