-- CreateIndex
CREATE INDEX "Notification_saleId_idx" ON "Notification"("saleId");

-- Organization_archivedAt_idx already exists (created by the
-- 20260603001000_add_organization_archive_fields migration) -- schema.prisma
-- just never declared it, so this migration only backfills that annotation
-- instead of re-creating the physical index.

-- CreateIndex
CREATE INDEX "Organization_onboardingStatus_idx" ON "Organization"("onboardingStatus");

-- CreateIndex
CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");

-- CreateIndex
CREATE INDEX "VerificationSession_saleId_idx" ON "VerificationSession"("saleId");

-- CreateIndex
CREATE INDEX "VerificationSession_status_idx" ON "VerificationSession"("status");
