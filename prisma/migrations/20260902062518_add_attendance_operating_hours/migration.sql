-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('QR', 'MANAGER', 'SYSTEM');

-- AlterTable
ALTER TABLE "AttendanceVisit" ADD COLUMN     "checkInManagerUserId" UUID,
ADD COLUMN     "checkInMethod" "AttendanceMethod" NOT NULL DEFAULT 'QR',
ADD COLUMN     "checkOutManagerUserId" UUID,
ADD COLUMN     "checkOutMethod" "AttendanceMethod";

-- AlterTable
ALTER TABLE "Lab" ADD COLUMN     "attendanceClosesAtMinute" SMALLINT NOT NULL DEFAULT 1080,
ADD COLUMN     "attendanceOpensAtMinute" SMALLINT NOT NULL DEFAULT 420;

-- BackfillData
UPDATE "AttendanceVisit"
SET "checkOutMethod" = 'QR'
WHERE "checkedOutAt" IS NOT NULL;

-- CreateIndex
CREATE INDEX "AttendanceVisit_labId_checkInManagerUserId_idx" ON "AttendanceVisit"("labId", "checkInManagerUserId");

-- CreateIndex
CREATE INDEX "AttendanceVisit_labId_checkOutManagerUserId_idx" ON "AttendanceVisit"("labId", "checkOutManagerUserId");

-- AddForeignKey
ALTER TABLE "AttendanceVisit" ADD CONSTRAINT "AttendanceVisit_labId_checkInManagerUserId_fkey" FOREIGN KEY ("labId", "checkInManagerUserId") REFERENCES "LabMembership"("labId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceVisit" ADD CONSTRAINT "AttendanceVisit_labId_checkOutManagerUserId_fkey" FOREIGN KEY ("labId", "checkOutManagerUserId") REFERENCES "LabMembership"("labId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "Lab"
ADD CONSTRAINT "Lab_attendance_schedule_check"
CHECK (
    "attendanceOpensAtMinute" >= 0
    AND "attendanceOpensAtMinute" < "attendanceClosesAtMinute"
    AND "attendanceClosesAtMinute" <= 1439
);

-- AddCheckConstraint
ALTER TABLE "AttendanceVisit"
ADD CONSTRAINT "AttendanceVisit_check_in_state_check"
CHECK (
    (
        "checkInMethod" = 'QR'
        AND "checkInManagerUserId" IS NULL
    )
    OR (
        "checkInMethod" = 'MANAGER'
        AND "checkInManagerUserId" IS NOT NULL
    )
);

-- AddCheckConstraint
ALTER TABLE "AttendanceVisit"
ADD CONSTRAINT "AttendanceVisit_check_out_state_check"
CHECK (
    (
        "checkedOutAt" IS NULL
        AND "checkOutMethod" IS NULL
        AND "checkOutManagerUserId" IS NULL
    )
    OR (
        "checkedOutAt" IS NOT NULL
        AND "checkOutMethod" IS NOT NULL
        AND (
            (
                "checkOutMethod" = 'MANAGER'
                AND "checkOutManagerUserId" IS NOT NULL
            )
            OR (
                "checkOutMethod" IN ('QR', 'SYSTEM')
                AND "checkOutManagerUserId" IS NULL
            )
        )
    )
);
