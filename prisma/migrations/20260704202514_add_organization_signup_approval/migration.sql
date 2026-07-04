-- CreateEnum
CREATE TYPE "OrganizationOnboardingStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "businessAddress" TEXT,
ADD COLUMN     "companiesHouseNumber" TEXT,
ADD COLUMN     "icoRegistrationNumber" TEXT,
ADD COLUMN     "onboardingStatus" "OrganizationOnboardingStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;
