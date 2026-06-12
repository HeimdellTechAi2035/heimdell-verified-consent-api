-- Add editable client compliance policy fields and immutable per-sale snapshots.

ALTER TABLE "Sale"
ADD COLUMN "policySnapshot" JSONB;

ALTER TABLE "ClientPolicy"
ADD COLUMN "privacyEvidenceWording" TEXT,
ADD COLUMN "directDebitGuaranteeWording" TEXT,
ADD COLUMN "policyVersion" TEXT NOT NULL DEFAULT 'v1';
