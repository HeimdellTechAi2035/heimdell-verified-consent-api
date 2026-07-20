-- AlterTable
ALTER TABLE "PhoneVerificationAttempt" ADD COLUMN     "wsTokenHash" TEXT,
ADD COLUMN     "wsTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneVerificationAttempt_wsTokenHash_key" ON "PhoneVerificationAttempt"("wsTokenHash");
