-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "brandAliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "brandExcludedNames" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "competitors" ADD COLUMN     "excludedNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
