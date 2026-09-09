import { beforeEach, describe, expect, it, vi } from "vitest";
import { metricPaths } from "./keyword-metrics";
import {
  fetchKeywordMetrics,
  fetchKeywordMetricsByIds,
  fetchProjectKeywordMetrics,
  fetchProjectKeywordVolumes,
} from "./keyword-metrics-query";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

type SqlFragment = { strings: readonly string[]; values: readonly unknown[] };

function isSqlFragment(value: unknown): value is SqlFragment {
  return Boolean(
    value &&
      typeof value === "object" &&
      "strings" in value &&
      "values" in value &&
      Array.isArray((value as SqlFragment).strings),
  );
}

function renderSql(strings: readonly string[], values: readonly unknown[]): string {
  return strings.reduce((sql, chunk, index) => {
    const value = values[index];
    return `${sql}${chunk}${isSqlFragment(value) ? renderSql(value.strings, value.values) : ""}`;
  }, "");
}

function lastQuerySql(): string {
  const [query, ...values] = mocks.prisma.$queryRaw.mock.calls.at(-1) ?? [];
  if (Array.isArray(query)) return renderSql(query, values);
  return isSqlFragment(query) ? renderSql(query.strings, query.values) : "";
}

function pathSqlFragment(path: readonly string[]) {
  return path.length === 1 ? `->'${path[0]}'` : `#>'{${path.join(",")}}'`;
}

describe("keyword metrics raw query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([]);
  });

  it("extracts scalar metrics with path fallbacks across newest-first checks", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        checks: [
          {
            keywordInfo: { searchVolume: "1500" },
            metrics: { difficulty: "0.45" },
          },
          {
            difficulty: 80,
            keyword_info: { cpc: "1.23" },
            volume: 9999,
          },
        ],
        keywordId: "keyword_1",
      },
    ]);

    const metrics = await fetchKeywordMetrics("keyword_1");

    expect(metrics).toEqual({
      cpc: 1.23,
      difficulty: 45,
      serpFeatures: [],
      volume: 1500,
    });
  });

  it("unions explicit features, merged type strings, and presence key aliases", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        checks: [
          {
            ai_overview: true,
            answer_box: true,
            features: ["inline_images", "videos_results"],
            inline_images: true,
            metrics: { serpFeatures: ["Sitelinks"] },
            related_questions: true,
            serpFeatures: ["Featured Snippet", "People also ask"],
            videos_results: true,
          },
        ],
        keywordId: "keyword_1",
      },
    ]);

    const metrics = await fetchKeywordMetrics("keyword_1");

    expect(metrics.serpFeatures.sort()).toEqual([
      "ai",
      "featured",
      "image",
      "paa",
      "sitelinks",
      "video",
    ]);
  });

  it("aliases local pack and local-results raw feature labels to local", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        checks: [{ serp_features: ["local pack"] }, { serp_features: ["local_results"] }],
        keywordId: "keyword_1",
      },
    ]);

    expect((await fetchKeywordMetrics("keyword_1")).serpFeatures).toEqual(["local"]);
  });

  it("returns empty metrics when a keyword has no checks", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ checks: null, keywordId: "keyword_1" }]);

    await expect(fetchKeywordMetrics("keyword_1")).resolves.toEqual({
      cpc: null,
      difficulty: null,
      serpFeatures: [],
      volume: null,
    });
  });

  it("returns a keyword-id keyed map with one project query", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      { checks: [{ cpc: 2.5 }], keywordId: "keyword_1" },
      { checks: [{ volume: "2400" }], keywordId: "keyword_2" },
    ]);

    const metrics = await fetchProjectKeywordMetrics("project_1", 25);

    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect([...metrics.keys()]).toEqual(["keyword_1", "keyword_2"]);
    expect(metrics.get("keyword_1")?.cpc).toBe(2.5);
    expect(metrics.get("keyword_2")?.volume).toBe(2400);
  });

  it("orders project metric rows with the same keyword tie-breaker as the list query", async () => {
    await fetchProjectKeywordMetrics("project_1", 25);

    expect(lastQuerySql()).toContain('ORDER BY k."createdAt" DESC, k.id DESC');
  });

  it("applies the overview device and tag filters inside the batched query", async () => {
    await fetchProjectKeywordMetrics("project_1", 25, { device: "mobile", tag: "Docs" });

    expect(lastQuerySql()).toContain("k.device::text =");
    expect(lastQuerySql()).toContain('FROM "keyword_tags" kt JOIN "tags" t');
  });

  it("projects only volume paths for the overview volume map", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      { checks: [{ keywordInfo: { searchVolume: "1200" } }], keywordId: "keyword_1" },
      { checks: null, keywordId: "keyword_2" },
    ]);

    const volumes = await fetchProjectKeywordVolumes("project_1", 25, {
      device: "mobile",
      tag: "Docs",
    });

    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect([...volumes]).toEqual([
      ["keyword_1", 1200],
      ["keyword_2", null],
    ]);
    expect(lastQuerySql()).toContain('ORDER BY k."createdAt" DESC, k.id DESC');
    expect(lastQuerySql()).toContain("k.device::text =");
    expect(lastQuerySql()).toContain('FROM "keyword_tags" kt JOIN "tags" t');
    for (const path of metricPaths.volume) expect(lastQuerySql()).toContain(pathSqlFragment(path));
    expect(lastQuerySql()).not.toContain("jsonb_path_exists");
    expect(lastQuerySql()).not.toContain("serpFeatures");
  });

  it("passes raw checks to the bounded canonical metrics walker", async () => {
    await fetchKeywordMetricsByIds(["keyword_1"]);

    expect(lastQuerySql()).toContain('SELECT rc."checkedAt", rc.id, rc.raw AS projection');
    expect(lastQuerySql()).toContain('ORDER BY rc."checkedAt" DESC, rc.id DESC');
    expect(lastQuerySql()).not.toContain("jsonb_path_query_array");
  });

  it("ignores arbitrary nested type values outside supported containers", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        checks: [{ metadata: { type: "video" }, payload: { nested: { type: "answer_box" } } }],
        keywordId: "keyword_1",
      },
    ]);

    expect((await fetchKeywordMetricsByIds(["keyword_1"])).get("keyword_1")?.serpFeatures).toEqual(
      [],
    );
  });

  it("recognizes supported nested provider feature containers", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        checks: [
          {
            result: [
              {
                items: [{ type: "answer_box" }, { type: "images" }],
                organic_results: [{ type: "video_results" }],
              },
            ],
            tasks: [{ result: [{ related_questions: [{}], type: "ai_overview" }] }],
          },
        ],
        keywordId: "keyword_1",
      },
    ]);

    expect(
      (await fetchKeywordMetricsByIds(["keyword_1"])).get("keyword_1")?.serpFeatures.sort(),
    ).toEqual(["ai", "featured", "image", "paa", "video"]);
  });
});
