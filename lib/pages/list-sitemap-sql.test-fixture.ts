import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";

export async function createPagesSitemapFixture(db: PGlite) {
  await db.exec(`DROP SCHEMA IF EXISTS pages_sitemap CASCADE; CREATE SCHEMA pages_sitemap; SET search_path TO pages_sitemap;
    CREATE TYPE "ProjectPageSourceKind" AS ENUM ('sitemap','search_console','rank_tracker','ai_citation','manual');
    CREATE TABLE project_pages (id text, "projectId" text, path text, "firstSeenAt" timestamp, "lastSeenAt" timestamp);
    CREATE TABLE project_page_sources ("pageId" text, source "ProjectPageSourceKind", "firstSeenAt" timestamp, "lastSeenAt" timestamp, detail jsonb);
    CREATE TABLE sitemap_snapshots (id text DEFAULT 'snapshot', "projectId" text, "fetchedAt" timestamp, entries jsonb DEFAULT '[]', "sitemapUrl" text DEFAULT 'https://example.com/sitemap.xml', "urlCount" int NOT NULL DEFAULT 0);
    CREATE TABLE page_snapshots (id text, "projectId" text, "takenOn" date, "pageCount" int, "archivedAt" timestamp);
    CREATE TABLE page_snapshot_pages ("snapshotId" text, "pageId" text);
    CREATE TABLE url_presences (id text, "projectId" text, url text, "coverageState" text, "pageFetchState" text, "checkedAt" timestamp, verdict text, "inspectionError" text);
    CREATE TABLE keywords (id text, "projectId" text, "targetUrl" text, "archivedAt" timestamp);
    CREATE TABLE rank_checks ("keywordId" text, "expectedUrlAtCheck" text, "checkedAt" timestamp);
    CREATE TABLE ai_tracking_citations ("sampleId" text, url text);
    CREATE TABLE ai_tracking_samples (id text, "projectId" text, "finishedAt" timestamp, "createdAt" timestamp);
    CREATE TABLE page_vitals ("pageId" text, strategy text, status text, source text, "lcpMs" int, "inpMs" int, cls numeric);
    INSERT INTO project_pages VALUES ('a','project_1','/a','2026-10-01','2026-10-01'), ('b','project_1','/b','2026-10-01','2026-10-01');
    INSERT INTO project_page_sources VALUES ('a','search_console','2026-10-01','2026-10-01',NULL);
  `);
  await db.exec(
    readFileSync(
      "prisma/migrations/20261113210000_sitemap_snapshot_completeness/migration.sql",
      "utf8",
    ),
  );
}
