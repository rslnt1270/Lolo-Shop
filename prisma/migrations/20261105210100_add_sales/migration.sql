-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('store', 'whatsapp');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('spay_transfer', 'cash', 'card');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('pending_payment', 'paid', 'cancelled', 'refunded');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'RETURN';

-- AlterTable
ALTER TABLE "InventoryLevel" ADD COLUMN     "minStock" INTEGER;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "saleId" TEXT;

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "channel" "SaleChannel" NOT NULL,
    "status" "SaleStatus" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "locationId" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "businessDate" DATE NOT NULL,
    "stockCommittedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "paymentConfirmedById" TEXT,
    "paymentConfirmedAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "customerAlias" VARCHAR(40),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "brandId" TEXT,
    "departmentId" TEXT,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_number_key" ON "Sale"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_clientRequestId_key" ON "Sale"("clientRequestId");

-- CreateIndex
CREATE INDEX "Sale_businessDate_idx" ON "Sale"("businessDate");

-- CreateIndex
CREATE INDEX "Sale_locationId_businessDate_idx" ON "Sale"("locationId", "businessDate");

-- CreateIndex
CREATE INDEX "Sale_channel_businessDate_idx" ON "Sale"("channel", "businessDate");

-- CreateIndex
CREATE INDEX "Sale_status_createdAt_idx" ON "Sale"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");

-- CreateIndex
CREATE INDEX "SaleLine_brandId_idx" ON "SaleLine"("brandId");

-- CreateIndex
CREATE INDEX "SaleLine_departmentId_idx" ON "SaleLine"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleLine_saleId_variantId_key" ON "SaleLine"("saleId", "variantId");

-- CreateIndex
CREATE INDEX "InventoryLevel_locationId_available_idx" ON "InventoryLevel"("locationId", "available");

-- CreateIndex
CREATE INDEX "Movement_saleId_idx" ON "Movement"("saleId");

-- CreateIndex
CREATE INDEX "Movement_type_timestamp_idx" ON "Movement"("type", "timestamp" DESC);

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_paymentConfirmedById_fkey" FOREIGN KEY ("paymentConfirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

