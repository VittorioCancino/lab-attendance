-- CreateTable
CREATE TABLE "AttendanceVisit" (
    "id" UUID NOT NULL,
    "labId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "checkedInAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutAt" TIMESTAMPTZ(3),

    CONSTRAINT "AttendanceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceVisit_labId_checkedInAt_id_idx" ON "AttendanceVisit"("labId", "checkedInAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "AttendanceVisit_labId_userId_checkedInAt_idx" ON "AttendanceVisit"("labId", "userId", "checkedInAt" DESC);

-- AddForeignKey
ALTER TABLE "AttendanceVisit" ADD CONSTRAINT "AttendanceVisit_labId_userId_fkey" FOREIGN KEY ("labId", "userId") REFERENCES "LabMembership"("labId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "AttendanceVisit"
ADD CONSTRAINT "AttendanceVisit_checkout_time_check"
CHECK ("checkedOutAt" IS NULL OR "checkedOutAt" >= "checkedInAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceVisit_open_membership_key"
ON "AttendanceVisit"("labId", "userId")
WHERE "checkedOutAt" IS NULL;

-- CreateIndex
CREATE INDEX "AttendanceVisit_open_lab_checkedInAt_idx"
ON "AttendanceVisit"("labId", "checkedInAt" DESC, "id" DESC)
WHERE "checkedOutAt" IS NULL;
