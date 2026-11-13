import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("prisma/migrations/20261110195000_page_tags/migration.sql", "utf8");

describe("page tags migration", () => {
  it("only creates the two tables, two enums, indexes, and foreign keys", () => {
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
      `CREATE TYPE "PageTagOrigin" AS ENUM ('rule', 'manual')`,
      `CREATE TYPE "TagPageRuleKind" AS ENUM ('path_pattern', 'sitemap', 'url_list', 'manual')`,
      'CREATE TABLE "page_tags" (',
      'CREATE TABLE "tag_page_rules" (',
      'CREATE INDEX "page_tags_pageId_idx" ON "page_tags"("pageId")',
      'CREATE UNIQUE INDEX "page_tags_tagId_pageId_key" ON "page_tags"("tagId", "pageId")',
      'CREATE UNIQUE INDEX "tag_page_rules_tagId_key" ON "tag_page_rules"("tagId")',
      'CREATE INDEX "tag_page_rules_updatedById_idx" ON "tag_page_rules"("updatedById")',
      'ALTER TABLE "page_tags" ADD CONSTRAINT "page_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE',
      'ALTER TABLE "page_tags" ADD CONSTRAINT "page_tags_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "project_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE',
      'ALTER TABLE "tag_page_rules" ADD CONSTRAINT "tag_page_rules_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE',
      'ALTER TABLE "tag_page_rules" ADD CONSTRAINT "tag_page_rules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    ]);
  });
});
