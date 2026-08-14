import { beforeEach, describe, expect, it, vi } from "vitest";
import { findKeywordMatches } from "./keyword-matches";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

describe("findKeywordMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("uses the indexed normalized expression and deduplicates request texts", async () => {
    await findKeywordMatches("project_1", [" Headless CMS ", "headless cms", "SEO"]);

    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    const query = mocks.queryRaw.mock.calls[0]?.[0] as {
      sql: string;
      values: unknown[];
    };
    expect(query.sql).toContain('k."projectId" = ?');
    expect(query.sql).toContain('lower(btrim(k."text")) IN (?,?)');
    expect(query.sql).toContain('r."checkedAt" DESC');
    expect(query.sql).toContain('count(*) OVER (PARTITION BY lower(btrim(k."text")))');
    expect(query.sql).toContain('"marketNumber" <= ?');
    expect(query.values).toEqual(["deferred", "project_1", "headless cms", "seo", 100]);
  });

  it("returns ranking URLs from the same non-deferred check row as latest positions", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        countryCode: "US",
        device: "desktop",
        keywordId: "kw_completed",
        languageCode: "en",
        languageLabel: "English",
        latestPosition: 3,
        location: "United States",
        locationKey: "US",
        marketCount: 1n,
        marketNumber: 1n,
        matchedText: "completed",
        previousPosition: 5,
        rankingUrl: "https://example.com/ranked",
        text: "completed",
      },
      {
        countryCode: "US",
        device: "desktop",
        keywordId: "kw_no_check",
        languageCode: "en",
        languageLabel: "English",
        latestPosition: null,
        location: "United States",
        locationKey: "US",
        marketCount: 1n,
        marketNumber: 1n,
        matchedText: "no check",
        previousPosition: null,
        rankingUrl: null,
        text: "no check",
      },
      {
        countryCode: "US",
        device: "desktop",
        keywordId: "kw_deferred_only",
        languageCode: "en",
        languageLabel: "English",
        latestPosition: null,
        location: "United States",
        locationKey: "US",
        marketCount: 1n,
        marketNumber: 1n,
        matchedText: "deferred only",
        previousPosition: null,
        rankingUrl: null,
        text: "deferred only",
      },
    ]);

    const result = await findKeywordMatches("project_1", [
      "completed",
      "no check",
      "deferred only",
    ]);
    const query = mocks.queryRaw.mock.calls[0]?.[0] as { sql: string };

    expect(query.sql).toContain('SELECT r."position", r."previousPosition", r."rankingUrl"');
    expect(query.sql).toContain('rc."rankingUrl" AS "rankingUrl"');
    expect(query.sql).toContain('r."status" <> ?');
    expect(result.matches).toEqual([
      expect.objectContaining({
        keywordId: "kw_completed",
        latestPosition: 3,
        rankingUrl: "https://example.com/ranked",
      }),
      expect.objectContaining({
        keywordId: "kw_no_check",
        latestPosition: null,
        rankingUrl: null,
      }),
      expect.objectContaining({
        keywordId: "kw_deferred_only",
        latestPosition: null,
        rankingUrl: null,
      }),
    ]);
  });
});
