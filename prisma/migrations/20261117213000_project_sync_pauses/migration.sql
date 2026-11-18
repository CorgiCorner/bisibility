CREATE TABLE "project_sync_pauses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pausedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "project_sync_pauses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_sync_pauses_projectId_kind_key"
    ON "project_sync_pauses"("projectId", "kind");

ALTER TABLE "project_sync_pauses" ADD CONSTRAINT "project_sync_pauses_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
