import { beforeEach, describe, expect, it, vi } from "vitest";
import { findStoredKeywordResearch, listStoredKeywordResearch } from "./stored-read";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { keywordResearchSnapshot: { findMany: mocks.findMany, findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/providers/registry", () => {
  throw new Error("stored reads must not load providers");
});
vi.mock("@/lib/provider-lookups/cache", () => {
  throw new Error("stored reads must not load caches");
});
vi.mock("@/lib/provider-lookups/paid-call", () => {
  throw new Error("stored reads must not load paid calls");
});
vi.mock("@/lib/provider-rates/connection-context", () => {
  throw new Error("stored reads must not load rate context");
});
vi.mock("./cache", () => {
  throw new Error("stored reads must not load keyword cache helpers");
});
vi.mock("./context", () => {
  throw new Error("stored reads must not load provider-aware context");
});
vi.mock("./source-call", () => {
  throw new Error("stored reads must not load source calls");
});

const snapshot = {
  countryCode: "US",
  fetchedAt: new Date("2026-08-01T12:00:00.000Z"),
  freshUntil: new Date("2026-08-31T12:00:00.000Z"),
  includeClickstream: false,
  languageCode: "en",
  mode: "ideas",
  provider: "Stored provider",
  requestKey: "a".repeat(64),
  resultLimit: 100,
  rows: [
    {
      competition: null,
      cpcCents: null,
      difficulty: null,
      intent: null,
      keyword: "Saved keyword",
      monthlyTrend: [],
      searchVolume: null,
      source: "idea",
    },
  ],
  seed: "seed",
  sources: [{ cached: true, costCents: 0, returned: 1, source: "idea", status: "ok" }],
  updatedAt: new Date("2026-08-02T12:00:00.000Z"),
  project: {
    keywords: [{ locationRef: { canonicalKey: "US" }, text: "Saved keyword" }],
    savedKeywords: [{ countryCode: "US", languageCode: "en", normalizedText: "saved keyword" }],
  },
};

describe("stored keyword research", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(snapshot);
    mocks.findMany.mockResolvedValue([snapshot]);
  });

  it("reads a stale envelope without providers and recalculates current flags", async () => {
    await expect(
      findStoredKeywordResearch({
        now: new Date("2026-09-10T12:00:00.000Z"),
        projectId: "project_1",
        requestKey: snapshot.requestKey,
      }),
    ).resolves.toMatchObject({
      costCents: 0,
      savedAt: "2026-08-02T12:00:00.000Z",
      stale: true,
      rows: [{ alreadySaved: true, alreadyTracked: true }],
    });
  });

  it("returns null for an unknown request and metadata without snapshot IDs", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(
      findStoredKeywordResearch({ projectId: "project_1", requestKey: snapshot.requestKey }),
    ).resolves.toBeNull();
    await expect(listStoredKeywordResearch({ projectId: "project_1" })).resolves.toEqual([
      expect.objectContaining({ requestKey: snapshot.requestKey, seed: "seed" }),
    ]);
  });
});
