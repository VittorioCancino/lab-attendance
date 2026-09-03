-- CreateEnum
CREATE TYPE "RateLimitAction" AS ENUM ('AUTH_CREDENTIALS', 'INVITATION_ACCEPTANCE', 'QR_EXCHANGE', 'ATTENDANCE_CONFIRMATION', 'DISPLAY_ACTIVATION');

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "labId" UUID NOT NULL,
    "action" "RateLimitAction" NOT NULL,
    "subjectHash" CHAR(64) NOT NULL,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "windowEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("labId","action","subjectHash")
);

-- CreateIndex
CREATE INDEX "RateLimitBucket_labId_windowEndsAt_idx" ON "RateLimitBucket"("labId", "windowEndsAt");

-- AddForeignKey
ALTER TABLE "RateLimitBucket" ADD CONSTRAINT "RateLimitBucket_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "RateLimitBucket"
ADD CONSTRAINT "RateLimitBucket_subject_hash_check"
CHECK ("subjectHash" ~ '^[0-9a-f]{64}$');

-- AddCheckConstraint
ALTER TABLE "RateLimitBucket"
ADD CONSTRAINT "RateLimitBucket_request_count_check"
CHECK ("requestCount" >= 1);

-- AddCheckConstraint
ALTER TABLE "RateLimitBucket"
ADD CONSTRAINT "RateLimitBucket_window_bounds_check"
CHECK ("windowEndsAt" > "windowStartedAt");
