-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsentEventType" ADD VALUE 'NAME_ADDRESS_CONFIRMED';
ALTER TYPE "ConsentEventType" ADD VALUE 'EXPLICIT_AGREEMENT_CONFIRMED';

-- AlterTable
ALTER TABLE "PhoneVerificationAttempt" ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "transcript" JSONB;

-- CreateIndex
CREATE INDEX "Organization_archivedAt_idx" ON "Organization"("archivedAt");
