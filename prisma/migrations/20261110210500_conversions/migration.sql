-- CreateEnum
CREATE TYPE "ConversionSource" AS ENUM ('ga4', 'plausible');

-- AlterTable
ALTER TABLE "project_defaults" ADD COLUMN     "primaryConversionSource" "ConversionSource";

-- CreateTable
CREATE TABLE "conversion_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" "ConversionSource" NOT NULL,
    "date" DATE NOT NULL,
    "path" TEXT NOT NULL,
    "pathHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "revenueMinor" BIGINT,
    "currency" CHAR(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversion_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_goals" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" "ConversionSource" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "countsRevenue" BOOLEAN NOT NULL DEFAULT false,
    "firstSeen" DATE NOT NULL,
    "lastSeen" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversion_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversion_daily_projectId_source_date_idx" ON "conversion_daily"("projectId", "source", "date");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_daily_projectId_source_date_pathHash_name_key" ON "conversion_daily"("projectId", "source", "date", "pathHash", "name");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_goals_projectId_source_sourceName_key" ON "conversion_goals"("projectId", "source", "sourceName");

-- AddForeignKey
ALTER TABLE "conversion_daily" ADD CONSTRAINT "conversion_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_goals" ADD CONSTRAINT "conversion_goals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
