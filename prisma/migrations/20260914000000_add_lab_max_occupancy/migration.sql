-- AlterTable
ALTER TABLE "Lab" ADD COLUMN "maxOccupancy" SMALLINT;

-- Enforce positive capacity when set
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_maxOccupancy_check" CHECK ("maxOccupancy" IS NULL OR "maxOccupancy" > 0);
