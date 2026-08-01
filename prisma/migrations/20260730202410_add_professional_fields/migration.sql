/*
  Warnings:

  - You are about to drop the column `zone` on the `Lead` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "zone",
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "nextFollowUpDate" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "zones" TEXT[];

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "address" TEXT,
ADD COLUMN     "age" INTEGER,
ADD COLUMN     "bathrooms" INTEGER,
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "coveredArea" DOUBLE PRECISION,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "exclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exclusiveUntil" TIMESTAMP(3),
ADD COLUMN     "floor" TEXT,
ADD COLUMN     "garage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "garageSpaces" INTEGER,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "ownerNotes" TEXT,
ADD COLUMN     "ownerPhone" TEXT,
ADD COLUMN     "rooms" INTEGER,
ADD COLUMN     "totalArea" DOUBLE PRECISION;
