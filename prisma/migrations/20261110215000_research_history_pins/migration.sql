-- CreateEnum
CREATE TYPE "ResearchHistorySurface" AS ENUM ('model_playground', 'serp_playground', 'keyword_research');

-- CreateTable
CREATE TABLE "research_history_pins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "surface" "ResearchHistorySurface" NOT NULL,
    "itemKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_history_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_history_pins_projectId_userId_surface_idx" ON "research_history_pins"("projectId", "userId", "surface");

-- CreateIndex
CREATE UNIQUE INDEX "research_history_pins_userId_projectId_surface_itemKey_key" ON "research_history_pins"("userId", "projectId", "surface", "itemKey");

-- AddForeignKey
ALTER TABLE "research_history_pins" ADD CONSTRAINT "research_history_pins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_history_pins" ADD CONSTRAINT "research_history_pins_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
