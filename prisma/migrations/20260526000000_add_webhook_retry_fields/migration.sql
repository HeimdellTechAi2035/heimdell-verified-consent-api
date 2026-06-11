-- Add durable webhook retry tracking to Notification.
-- This migration is additive and safe for existing notification rows.
-- Existing rows receive attempts=0 and maxAttempts=5 defaults.

ALTER TABLE "Notification" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Notification" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Notification" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "lastResponseStatus" INTEGER;
ALTER TABLE "Notification" ADD COLUMN "lastSafeError" TEXT;
ALTER TABLE "Notification" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "terminalFailureAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "deliveryId" TEXT;

CREATE UNIQUE INDEX "Notification_deliveryId_key" ON "Notification"("deliveryId");
CREATE INDEX "Notification_channel_status_nextAttemptAt_idx" ON "Notification"("channel", "status", "nextAttemptAt");
