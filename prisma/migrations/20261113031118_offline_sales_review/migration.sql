-- CreateEnum
CREATE TYPE "SaleOrigin" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "SaleReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "offlineSnapshotAt" TIMESTAMP(3),
ADD COLUMN     "origin" "SaleOrigin" NOT NULL DEFAULT 'online',
ADD COLUMN     "reviewNote" VARCHAR(200),
ADD COLUMN     "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reviewStatus" "SaleReviewStatus",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "soldAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "shortfall" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Sale_reviewStatus_createdAt_idx" ON "Sale"("reviewStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
