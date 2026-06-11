-- Additive archive metadata for platform-admin client lifecycle controls.
-- This preserves all existing sales, verification sessions, certificates, audit logs,
-- webhook deliveries, and consent evidence.

ALTER TABLE "Organization"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT;

CREATE INDEX "Organization_archivedAt_idx" ON "Organization"("archivedAt");
