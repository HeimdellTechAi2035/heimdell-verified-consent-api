-- AlterEnum
ALTER TYPE "ConsentEventType" ADD VALUE 'DATA_CORRECTED_ON_CALL';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewFlags" JSONB;

-- CreateIndex
CREATE INDEX "Sale_needsReview_idx" ON "Sale"("needsReview");
