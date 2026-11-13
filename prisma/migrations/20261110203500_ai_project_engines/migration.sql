-- CreateTable
CREATE TABLE "ai_project_engines" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "engine" "AiTrackingEngine" NOT NULL,
    "source" "AiTrackingSource" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_project_engines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_project_engines_updatedById_idx" ON "ai_project_engines"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "ai_project_engines_projectId_engine_source_key" ON "ai_project_engines"("projectId", "engine", "source");

-- AddForeignKey
ALTER TABLE "ai_project_engines" ADD CONSTRAINT "ai_project_engines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_project_engines" ADD CONSTRAINT "ai_project_engines_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
