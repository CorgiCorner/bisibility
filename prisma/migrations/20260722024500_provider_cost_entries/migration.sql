-- CreateEnum
CREATE TYPE "ProviderCostFeature" AS ENUM ('ranked_keywords');

-- CreateTable
CREATE TABLE "provider_cost_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "feature" "ProviderCostFeature" NOT NULL DEFAULT 'ranked_keywords',
    "costCents" DECIMAL(10,4) NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_cost_entries_projectId_createdAt_idx" ON "provider_cost_entries"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "provider_cost_entries_connectionId_createdAt_idx" ON "provider_cost_entries"("connectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "provider_cost_entries" ADD CONSTRAINT "provider_cost_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
