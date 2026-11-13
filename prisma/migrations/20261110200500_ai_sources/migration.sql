-- CreateEnum
CREATE TYPE "AiSourceType" AS ENUM ('directory', 'reviews', 'community', 'editorial', 'other');

-- CreateEnum
CREATE TYPE "AiSourcePlanState" AS ENUM ('todo', 'done', 'dismissed');

-- CreateTable
CREATE TABLE "ai_source_type_overrides" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "type" "AiSourceType" NOT NULL,
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_source_type_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_source_plan_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "url" TEXT,
    "state" "AiSourcePlanState" NOT NULL DEFAULT 'todo',
    "note" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_source_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_source_type_overrides_setById_idx" ON "ai_source_type_overrides"("setById");

-- CreateIndex
CREATE UNIQUE INDEX "ai_source_type_overrides_projectId_domain_key" ON "ai_source_type_overrides"("projectId", "domain");

-- CreateIndex
CREATE INDEX "ai_source_plan_items_addedById_idx" ON "ai_source_plan_items"("addedById");

-- CreateIndex
CREATE UNIQUE INDEX "ai_source_plan_items_projectId_domain_key" ON "ai_source_plan_items"("projectId", "domain");

-- AddForeignKey
ALTER TABLE "ai_source_type_overrides" ADD CONSTRAINT "ai_source_type_overrides_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_source_type_overrides" ADD CONSTRAINT "ai_source_type_overrides_setById_fkey" FOREIGN KEY ("setById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_source_plan_items" ADD CONSTRAINT "ai_source_plan_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_source_plan_items" ADD CONSTRAINT "ai_source_plan_items_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
