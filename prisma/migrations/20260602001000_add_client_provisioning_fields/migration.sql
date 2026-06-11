ALTER TABLE "Organization"
  ADD COLUMN "primaryContactName" TEXT,
  ADD COLUMN "primaryContactEmail" TEXT,
  ADD COLUMN "primaryContactPhone" TEXT,
  ADD COLUMN "notes" TEXT;

ALTER TABLE "User"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
