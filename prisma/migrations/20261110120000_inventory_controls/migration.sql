-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "mergedAt" TIMESTAMP(3),
ADD COLUMN     "mergedById" TEXT,
ADD COLUMN     "mergedIntoId" TEXT;

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "oldPrice" DECIMAL(10,2) NOT NULL,
    "newPrice" DECIMAL(10,2) NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceChange_variantId_createdAt_idx" ON "PriceChange"("variantId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Movement_requestId_key" ON "Movement"("requestId");

-- CreateIndex
CREATE INDEX "Product_mergedIntoId_idx" ON "Product"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_mergedById_fkey" FOREIGN KEY ("mergedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

