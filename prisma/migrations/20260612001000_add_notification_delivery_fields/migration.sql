-- Add production notification delivery tracking fields.
-- Safe for existing data: all table columns are nullable except updatedAt,
-- which is backfilled with the current timestamp and then maintained by Prisma.

ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'SENDING';

ALTER TABLE "Notification"
ADD COLUMN "notificationType" TEXT,
ADD COLUMN "subject" TEXT,
ADD COLUMN "messagePreview" TEXT,
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
