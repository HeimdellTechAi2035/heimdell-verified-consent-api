-- Add Supabase Auth identity mapping for dashboard users.
-- This migration is additive and does not modify sensitive consent data.

ALTER TABLE "User" ADD COLUMN "externalAuthId" TEXT;

CREATE UNIQUE INDEX "User_externalAuthId_key" ON "User"("externalAuthId");
