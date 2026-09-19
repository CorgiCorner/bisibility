import type { ApiContext } from "@/lib/api/context";
import {
  buildCompetitorMarket,
  emptyCompetitorFilter,
} from "@/lib/competitors/competitor-market-model";
import type { CompetitorMarketData } from "@/lib/competitors/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listProjectCompetitors } from "./competitors";

const mocks = vi.hoisted(() => ({ getCompetitorsApiViewFor: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/competitors", () => ({
  getCompetitorsApiViewFor: mocks.getCompetitorsApiViewFor,
}));
vi.mock("@/lib/competitors/service", () => ({
  addManagedCompetitorFor: vi.fn(),
  removeManagedCompetitorFor: vi.fn(),
}));

const columns = [
  { domain: "example.com", kind: "You" as const, label: "example.com" },
  ...Array.from({ length: 6 }, (_, index) => ({
    domain: `competitor-${index + 1}.dev`,
    id: `cmp_${index + 1}`,
    kind: "Managed" as const,
    label: `Competitor ${index + 1}`,
  })),
];

function observationRanks(competitorRanks: Array<number | null>) {
  return Object.fromEntries([
    ["example.com", null],
    ...columns.slice(1).map((column, index) => [column.domain, competitorRanks[index] ?? null]),
  ]);
}

const baseObservations = [
  {
    checkedAt: "2026-09-10T08:00:00.000Z",
    completed: true,
    id: "kw_1",
    keyword: "rank tracker",
    ranked: true,
    ranks: observationRanks([1, 2, 4, 6, 8, 10]),
    tags: ["core"],
    volume: 1_000,
  },
  {
    checkedAt: "2026-09-12T08:00:00.000Z",
    completed: true,
    id: "kw_2",
    keyword: "serp api",
    ranked: true,
    ranks: observationRanks([3, 5, 7, 9, null, null]),
    tags: [],
    volume: 100,
  },
] satisfies CompetitorMarketData["observations"];

function marketData(observations: CompetitorMarketData["observations"]): CompetitorMarketData {
  return {
    allColumns: columns,
    competitorCount: 6,
    device: "desktop",
    engine: "google",
    key: "location_us::desktop::google",
    languageLabel: "English",
    location: "United States",
    locationId: "location_us",
    locationKind: "country",
    observations,
    tags: ["core"],
    trackedKeywordCount: observations.length,
  };
}

function context(): ApiContext {
  const url = new URL("https://app.example.com/api/v1/projects/prj_1/competitors");
  return {
    actor: { id: "api-key", memberships: [{ projectId: "project_1", role: "admin" }] },
    auth: {
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: "project_1",
        scopes: ["read"],
      },
      project: {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        domain: "example.com",
        id: "project_1",
        name: "Example",
        publicId: "prj_1",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    headers: new Headers(),
    instance: url.toString(),
    method: "GET",
    path: ["projects", "prj_1", "competitors"],
    req: new Request(url),
    url,
  };
}

function mockView(observations: CompetitorMarketData["observations"]) {
  mocks.getCompetitorsApiViewFor.mockResolvedValue({
    managedCompetitors: [
      { domain: "competitor-1.dev", id: "cmp_1", initials: "C1", label: "Competitor 1" },
    ],
    markets: [buildCompetitorMarket(marketData(observations), emptyCompetitorFilter)],
    suggestions: [{ domain: "rival.dev", initials: "RD", overlap: 2 }],
  });
}

const presentationOnlyKeys = ["columns", "all_columns", "rows", "color", "initials"];

describe("competitors API projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockView(baseObservations);
  });

  it("serves the honest market matrix without presentation-only keys", async () => {
    const response = await listProjectCompetitors(context(), "prj_1");
    const body = await response.json();
    const market = body.meta.markets[0];

    expect(Object.keys(market).sort()).toEqual([
      "checked_keyword_count",
      "country",
      "data_state",
      "device",
      "domains",
      "engine",
      "id",
      "measured_at",
      "observations",
      "shared_keyword_count",
      "shares",
    ]);
    for (const key of [...presentationOnlyKeys, "volume", "language_label"]) {
      expect(JSON.stringify(body)).not.toContain(`"${key}"`);
    }
    expect(market.data_state).toBe("ranked");
    expect(market.id).toBe("location_us::desktop::google");
    expect(market.country).toBe("United States");
    expect(market.device).toBe("Desktop");
    expect(market.engine).toBe("Google");
    expect(market.checked_keyword_count).toBe(2);
    expect(market.shared_keyword_count).toBe(2);
    expect(market.measured_at).toBe("2026-09-12T08:00:00.000Z");
    expect(market.domains).toEqual([
      { domain: "example.com", managed: false },
      ...Array.from({ length: 6 }, (_, index) => ({
        domain: `competitor-${index + 1}.dev`,
        managed: true,
      })),
    ]);
  });

  it("maps every observation with its check date, keyword identity, and ranks", async () => {
    const response = await listProjectCompetitors(context(), "prj_1");
    const body = await response.json();
    const observations = body.meta.markets[0].observations;

    expect(observations).toHaveLength(2);
    expect(observations[0]).toEqual({
      checked_at: "2026-09-10T08:00:00.000Z",
      completed: true,
      id: "kw_1",
      keyword: "rank tracker",
      keyword_id: "kw_1",
      ranked: true,
      ranks: observationRanks([1, 2, 4, 6, 8, 10]),
      tags: ["core"],
    });
    expect(observations[1].checked_at).toBe("2026-09-12T08:00:00.000Z");
  });

  it("serves exact share-of-voice fractions that sum to 1 over managed domains", async () => {
    const response = await listProjectCompetitors(context(), "prj_1");
    const body = await response.json();
    const shares = body.meta.markets[0].shares as Array<{
      domain: string;
      share_of_voice: number;
    }>;

    expect(shares).toHaveLength(7);
    expect(shares.every((share) => typeof share.share_of_voice === "number")).toBe(true);
    const managedTotal = shares.slice(1).reduce((sum, share) => sum + share.share_of_voice, 0);
    expect(Math.abs(managedTotal - 1)).toBeLessThan(1e-9);
    expect(shares[0]).toEqual({ domain: "example.com", share_of_voice: 0, shared_keywords: 0 });
  });

  it("keeps the exact API fractions consistent with the rounded model percents", async () => {
    const response = await listProjectCompetitors(context(), "prj_1");
    const body = await response.json();
    const apiShares = body.meta.markets[0].shares as Array<{
      domain: string;
      share_of_voice: number;
      shared_keywords: number;
    }>;
    const modelShares = buildCompetitorMarket(
      marketData(baseObservations),
      emptyCompetitorFilter,
    ).shares;

    for (const modelShare of modelShares) {
      const apiShare = apiShares.find((share) => share.domain === modelShare.domain);
      expect(apiShare?.shared_keywords).toBe(modelShare.sharedKeywords);
      expect(Math.round((apiShare?.share_of_voice ?? Number.NaN) * 100)).toBe(
        modelShare.shareOfVoice,
      );
    }
  });

  it("keeps shares normalized across every domain when the project domain ranks", async () => {
    const ranking = baseObservations.map((observation) => ({
      ...observation,
      ranks: { ...observation.ranks, "example.com": observation.id === "kw_1" ? 2 : null },
    }));
    mockView(ranking);

    const response = await listProjectCompetitors(context(), "prj_1");
    const body = await response.json();
    const shares = body.meta.markets[0].shares as Array<{
      domain: string;
      managed?: boolean;
      share_of_voice: number;
    }>;
    const total = shares.reduce((sum, share) => sum + share.share_of_voice, 0);

    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
    expect(shares.find((share) => share.domain === "example.com")?.share_of_voice).toBeGreaterThan(
      0,
    );
  });

  it("nulls share of voice for every domain when there is no volume data", async () => {
    mockView(
      baseObservations.map((observation, index) => ({
        ...observation,
        volume: index === 0 ? null : 0,
      })),
    );

    const response = await listProjectCompetitors(context(), "prj_1");
    const body = await response.json();
    const market = body.meta.markets[0];

    expect(market.data_state).toBe("no_volume_data");
    expect(market.measured_at).toBe("2026-09-12T08:00:00.000Z");
    expect(
      market.observations.map((observation: { checked_at: string }) => observation.checked_at),
    ).toEqual(["2026-09-10T08:00:00.000Z", "2026-09-12T08:00:00.000Z"]);
    expect(market.shares).toHaveLength(7);
    expect(
      market.shares.every(
        (share: { share_of_voice: number | null }) => share.share_of_voice === null,
      ),
    ).toBe(true);
  });

  it("reports a null check date for observations without a completed check", async () => {
    mockView([
      ...baseObservations,
      {
        completed: false,
        id: "kw_pending",
        keyword: "pending keyword",
        ranked: false,
        ranks: Object.fromEntries(columns.map((column) => [column.domain, null])),
        tags: [],
        volume: null,
      },
    ]);

    const response = await listProjectCompetitors(context(), "prj_1");
    const body = await response.json();
    const market = body.meta.markets[0];

    expect(
      market.observations.find((observation: { id: string }) => observation.id === "kw_pending"),
    ).toMatchObject({ checked_at: null, completed: false });
    expect(market.measured_at).toBe("2026-09-12T08:00:00.000Z");
  });

  it("strips presentation-only keys from data items and suggestions", async () => {
    const response = await listProjectCompetitors(context(), "prj_1");
    const body = await response.json();

    expect(body.data).toEqual([{ domain: "competitor-1.dev", id: "cmp_1", label: "Competitor 1" }]);
    expect(body.meta.suggestions).toEqual([{ domain: "rival.dev", overlap: 2 }]);
  });
});
