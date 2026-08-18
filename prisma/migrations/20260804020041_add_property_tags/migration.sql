-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
