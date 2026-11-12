-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "audience" VARCHAR(20),
ADD COLUMN     "productTypeId" TEXT,
ADD COLUMN     "style" VARCHAR(40);

-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "productTypeId" TEXT;

-- CreateTable
CREATE TABLE "ProductType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentProductType" (
    "departmentId" TEXT NOT NULL,
    "productTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentProductType_pkey" PRIMARY KEY ("departmentId","productTypeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_slug_key" ON "ProductType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_name_key" ON "ProductType"("name");

-- CreateIndex
CREATE INDEX "DepartmentProductType_productTypeId_idx" ON "DepartmentProductType"("productTypeId");

-- CreateIndex
CREATE INDEX "Product_productTypeId_idx" ON "Product"("productTypeId");

-- CreateIndex
CREATE INDEX "SaleLine_productTypeId_idx" ON "SaleLine"("productTypeId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentProductType" ADD CONSTRAINT "DepartmentProductType_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentProductType" ADD CONSTRAINT "DepartmentProductType_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

