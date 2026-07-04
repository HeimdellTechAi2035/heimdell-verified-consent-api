-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('LINK', 'PHONE_CALL');

-- CreateEnum
CREATE TYPE "PhoneCallStatus" AS ENUM ('QUEUED', 'INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'BUSY', 'FAILED', 'NO_ANSWER', 'CANCELED');

-- AlterTable
ALTER TABLE "VerificationSession" ADD COLUMN     "method" "VerificationMethod" NOT NULL DEFAULT 'LINK';

-- CreateTable
CREATE TABLE "PhoneVerificationAttempt" (
    "id" TEXT NOT NULL,
    "verificationSessionId" TEXT NOT NULL,
    "providerCallSid" TEXT,
    "toPhone" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "status" "PhoneCallStatus" NOT NULL DEFAULT 'QUEUED',
    "digitsPressed" TEXT,
    "recordingSid" TEXT,
    "recordingUrl" TEXT,
    "recordingDurationSeconds" INTEGER,
    "errorMessage" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneVerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneVerificationAttempt_providerCallSid_key" ON "PhoneVerificationAttempt"("providerCallSid");

-- CreateIndex
CREATE INDEX "PhoneVerificationAttempt_verificationSessionId_idx" ON "PhoneVerificationAttempt"("verificationSessionId");

-- AddForeignKey
ALTER TABLE "PhoneVerificationAttempt" ADD CONSTRAINT "PhoneVerificationAttempt_verificationSessionId_fkey" FOREIGN KEY ("verificationSessionId") REFERENCES "VerificationSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
