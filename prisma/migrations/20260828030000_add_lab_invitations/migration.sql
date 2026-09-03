-- CreateTable
CREATE TABLE "LabInvitation" (
    "id" UUID NOT NULL,
    "labId" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "role" "LabMembershipRole" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "invitedByUserId" UUID NOT NULL,
    "acceptedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LabInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabInvitation_tokenHash_key" ON "LabInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "LabInvitation_labId_role_createdAt_idx" ON "LabInvitation"("labId", "role", "createdAt");

-- CreateIndex
CREATE INDEX "LabInvitation_labId_email_idx" ON "LabInvitation"("labId", "email");

-- CreateIndex
CREATE INDEX "LabInvitation_invitedByUserId_idx" ON "LabInvitation"("invitedByUserId");

-- CreateIndex
CREATE INDEX "LabInvitation_acceptedByUserId_idx" ON "LabInvitation"("acceptedByUserId");

-- AddForeignKey
ALTER TABLE "LabInvitation" ADD CONSTRAINT "LabInvitation_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabInvitation" ADD CONSTRAINT "LabInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabInvitation" ADD CONSTRAINT "LabInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "LabInvitation"
ADD CONSTRAINT "LabInvitation_email_normalized_check"
CHECK ("email" = lower(btrim("email")));

-- AddCheckConstraint
ALTER TABLE "LabInvitation"
ADD CONSTRAINT "LabInvitation_expiry_check"
CHECK ("expiresAt" > "createdAt");

-- AddCheckConstraint
ALTER TABLE "LabInvitation"
ADD CONSTRAINT "LabInvitation_terminal_state_check"
CHECK (NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "LabInvitation_active_email_key"
ON "LabInvitation"("labId", "email")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
