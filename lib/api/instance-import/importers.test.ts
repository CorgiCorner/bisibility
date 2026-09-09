import { cloudImportBodySchema } from "@/lib/api/instance-import/schemas";
import type { Prisma } from "@/lib/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { historyImportResultCounts } from "./history-counts";
import { importHistory, keywordKey, loadKeywordMaps, loadKeywordMapsForProject } from "./importers";

const keywordId = "kw_abcdefghijklmnopqrstuvwx";

function keywords(requestedDepths: Array<number | null>) {
  return cloudImportBodySchema.parse({
    alert_rules: [],
    competitors: [],
    keywords: [
      {
        device: "desktop",
        id: keywordId,
        keyword: "rank tracker",
        location: "United States",
        rankingHistory: requestedDepths.map((requestedDepth, index) => ({
          checkedAt: `2026-06-${String(index + 20).padStart(2, "0")}T10:00:00.000Z`,
          normalizationVersion: "v1",
          position: index + 1,
          previousPosition: null,
          provider: "provider",
          rankingUrl: null,
          requestedDepth,
        })),
        tags: [],
        target_url: null,
      },
    ],
    notification_preferences: [],
    project_id: "prj_bbcdefghijklmnopqrstuvwx",
    saved_views: [],
    version: 6,
  }).keywords;
}

function client(existing: Array<{ checkedAt: Date; keywordId: string }> = []) {
  return {
    rankCheck: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue(existing),
    },
  } as unknown as Prisma.TransactionClient;
}

function mappedKeywordIds(input: ReturnType<typeof keywords>) {
  const keyword = input[0];
  if (!keyword) throw new Error("Expected an imported keyword.");
  return new Map([[keywordKey(keyword), "keyword_1"]]);
}

describe("imported history depth counts", () => {
  it("reports only received null-depth rows in the Visibility count", async () => {
    const input = keywords([100, null, 10]);
    const result = await importHistory(input, mappedKeywordIds(input), client());

    expect(historyImportResultCounts(result)).toEqual({
      history: 3,
      history_received: 3,
      history_skipped: 0,
      history_unknown_depth: 1,
    });
  });

  it("keeps the received unknown-depth count when duplicate history is skipped", async () => {
    const input = keywords([null]);
    const checkedAt = input[0]?.rankingHistory[0]?.checkedAt;
    if (!checkedAt) throw new Error("Expected imported history.");
    const result = await importHistory(
      input,
      mappedKeywordIds(input),
      client([{ checkedAt, keywordId: "keyword_1" }]),
    );

    expect(historyImportResultCounts(result)).toEqual({
      history: 0,
      history_received: 1,
      history_skipped: 1,
      history_unknown_depth: 1,
    });
  });

  it("keeps same-label language locations distinct and maps v6 country names to their canonical row", async () => {
    const parsed = cloudImportBodySchema.parse({
      alert_rules: [],
      competitors: [],
      keywords: [
        {
          device: "desktop",
          id: keywordId,
          keyword: "rank tracker",
          location: "Madrid, Community of Madrid, Spain",
          location_key: "ES/Community of Madrid/Madrid@en",
          tags: [],
        },
        {
          device: "desktop",
          id: "kw_bbcdefghijklmnopqrstuvwx",
          keyword: "rank tracker",
          location: "Madrid, Community of Madrid, Spain",
          location_key: "ES/Community of Madrid/Madrid@es",
          tags: [],
        },
        {
          device: "desktop",
          id: "kw_ccdefghijklmnopqrstuvwxy",
          keyword: "country row",
          location: "United States",
          tags: [],
        },
      ],
      notification_preferences: [],
      project_id: "prj_bbcdefghijklmnopqrstuvwx",
      saved_views: [],
      version: 6,
    });
    const importClient = {
      keyword: {
        findMany: vi.fn().mockResolvedValue([
          {
            device: "desktop",
            id: "keyword_en",
            locationRef: { canonicalKey: "ES/Community of Madrid/Madrid@en" },
            text: "rank tracker",
          },
          {
            device: "desktop",
            id: "keyword_es",
            locationRef: { canonicalKey: "ES/Community of Madrid/Madrid" },
            text: "rank tracker",
          },
          {
            device: "desktop",
            id: "keyword_us",
            locationRef: { canonicalKey: "US" },
            text: "country row",
          },
        ]),
      },
    } as unknown as Prisma.TransactionClient;
    const maps = await loadKeywordMaps("project_1", parsed.keywords, importClient);
    const [english, spanish, unitedStates] = parsed.keywords;
    if (!english || !spanish || !unitedStates) throw new Error("Expected three imported keywords.");

    expect(maps.byKey.get(keywordKey(english))).toBe("keyword_en");
    expect(maps.byKey.get(keywordKey(spanish))).toBe("keyword_es");
    expect(maps.byKey.get(keywordKey(unitedStates))).toBe("keyword_us");

    const sourceMaps = await loadKeywordMapsForProject(importClient, "project_1", {
      [keywordId]: {
        device: "desktop",
        location: "Madrid, Community of Madrid, Spain",
        location_key: "ES/Community of Madrid/Madrid@en",
        text: "rank tracker",
      },
      kw_bbcdefghijklmnopqrstuvwx: {
        device: "desktop",
        location: "Madrid, Community of Madrid, Spain",
        location_key: "ES/Community of Madrid/Madrid",
        text: "rank tracker",
      },
    });
    expect(sourceMaps.bySource).toEqual(
      new Map([
        [keywordId, "keyword_en"],
        ["kw_bbcdefghijklmnopqrstuvwx", "keyword_es"],
      ]),
    );
  });
});
