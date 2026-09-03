-- CreateTable
CREATE TABLE "AttendanceCronState" (
    "labId" UUID NOT NULL,
    "lastSucceededAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AttendanceCronState_pkey" PRIMARY KEY ("labId")
);

-- AddForeignKey
ALTER TABLE "AttendanceCronState" ADD CONSTRAINT "AttendanceCronState_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
