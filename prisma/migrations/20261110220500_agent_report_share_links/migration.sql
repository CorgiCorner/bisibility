-- CreateTable
CREATE TABLE "agent_report_share_links" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_report_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_report_share_link_reports" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_report_share_link_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_report_share_link_days" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agent_report_share_link_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_report_share_links_publicId_key" ON "agent_report_share_links"("publicId");

-- Public id format, same contract as the other runtime resources.
ALTER TABLE "agent_report_share_links"
  ADD CONSTRAINT "agent_report_share_links_public_id_contract_format" CHECK ("publicId" ~ '^rsl_[a-z][a-z0-9]{23}$'::text);

-- CreateIndex
CREATE UNIQUE INDEX "agent_report_share_links_tokenHash_key" ON "agent_report_share_links"("tokenHash");

-- CreateIndex
CREATE INDEX "agent_report_share_links_projectId_createdAt_idx" ON "agent_report_share_links"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_report_share_link_reports_reportId_idx" ON "agent_report_share_link_reports"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_report_share_link_reports_shareLinkId_reportId_key" ON "agent_report_share_link_reports"("shareLinkId", "reportId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_report_share_link_days_shareLinkId_day_key" ON "agent_report_share_link_days"("shareLinkId", "day");

-- AddForeignKey
ALTER TABLE "agent_report_share_links" ADD CONSTRAINT "agent_report_share_links_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_report_share_links" ADD CONSTRAINT "agent_report_share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_report_share_link_reports" ADD CONSTRAINT "agent_report_share_link_reports_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "agent_report_share_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_report_share_link_reports" ADD CONSTRAINT "agent_report_share_link_reports_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "agent_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_report_share_link_days" ADD CONSTRAINT "agent_report_share_link_days_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "agent_report_share_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
