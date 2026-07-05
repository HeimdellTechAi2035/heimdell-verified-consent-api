-- Adds a nullable SHA-256 lookup hash column for O(1) API key/client
-- authentication instead of a linear bcrypt scan. Nullable and unique:
-- existing rows keep NULL (Postgres allows any number of NULLs under a
-- unique constraint) and fall back to the pre-existing scan in auth.ts.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "lookupHash" TEXT;

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "lookupHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_lookupHash_key" ON "Client"("lookupHash");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_lookupHash_key" ON "ApiKey"("lookupHash");
