-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "catalogPhotosCheckedAt" TIMESTAMP(3),
ADD COLUMN     "color" VARCHAR(40),
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ColorOption" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColorOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ColorOption_key_key" ON "ColorOption"("key");

-- CreateIndex
CREATE INDEX "Product_isPublished_idx" ON "Product"("isPublished");

-- AddForeignKey
ALTER TABLE "ColorOption" ADD CONSTRAINT "ColorOption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
