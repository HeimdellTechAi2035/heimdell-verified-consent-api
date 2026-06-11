ALTER TABLE "Sale"
  ADD COLUMN "submittedByUserId" TEXT;

CREATE INDEX "Sale_submittedByUserId_idx" ON "Sale"("submittedByUserId");

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
