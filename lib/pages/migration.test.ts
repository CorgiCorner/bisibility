import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("prisma/migrations/20261110193500_project_pages/migration.sql", "utf8");

describe("project pages migration", () => {
  it("only creates the page tables, the source enum, and their indexes and foreign keys", () => {
    const statements = sql
      .split(";")
      .map((statement) =>
        statement
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim(),
      )
      .filter(Boolean);
    expect(statements.map((statement) => statement.split("\n")[0])).toEqual([
      "CREATE TYPE \"ProjectPageSourceKind\" AS ENUM ('sitemap', 'search_console', 'rank_tracker', 'ai_citation', 'manual')",
      'CREATE TABLE "project_pages" (',
      'CREATE TABLE "project_page_sources" (',
      'CREATE INDEX "project_pages_projectId_path_idx" ON "project_pages"("projectId", "path")',
      'CREATE UNIQUE INDEX "project_pages_projectId_pathHash_key" ON "project_pages"("projectId", "pathHash")',
      'CREATE UNIQUE INDEX "project_page_sources_pageId_source_key" ON "project_page_sources"("pageId", "source")',
      'ALTER TABLE "project_pages" ADD CONSTRAINT "project_pages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE',
      'ALTER TABLE "project_page_sources" ADD CONSTRAINT "project_page_sources_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "project_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    ]);
  });
});
