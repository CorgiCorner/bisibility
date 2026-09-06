import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKeywordBatchSet } from "./keyword-batch";

const mocks = vi.hoisted(() => ({
  assertKeywordCapacity: vi.fn(),
  lockKeywordCapacity: vi.fn(),
  makePublicId: vi.fn(),
  seedKeywordDispatchStates: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/resource-limits", () => ({
  assertKeywordCapacity: mocks.assertKeywordCapacity,
  lockKeywordCapacity: mocks.lockKeywordCapacity,
}));
vi.mock("@/lib/rank-check/dispatcher-state", () => ({
  seedKeywordDispatchStates: mocks.seedKeywordDispatchStates,
}));
vi.mock("./_shared", () => ({ makePublicId: mocks.makePublicId }));

function stored(index: number) {
  return {
    archivedAt: null as Date | null,
    device: "desktop" as const,
    id: `keyword_${index}`,
    intent: null,
    locationId: "location_1",
    publicId: `kw_${index}`,
    targetUrl: null,
    text: `keyword ${index}`,
    topic: null,
  };
}

function row(index: number) {
  return {
    device: "desktop" as const,
    keyword: `keyword ${index}`,
    location: "United States",
    locationId: "location_1",
    schedule: null,
    tags: [],
  };
}

describe("set-based keyword batch creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lockKeywordCapacity.mockResolvedValue(null);
    mocks.makePublicId.mockReturnValueOnce("kw_candidate_1").mockReturnValueOnce("kw_candidate_2");
    mocks.seedKeywordDispatchStates.mockResolvedValue(2);
  });

  it("seeds only newly inserted IDs once inside the caller transaction", async () => {
    const inserted = [stored(1), stored(2)];
    const client = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      keyword: {
        createMany: vi.fn(),
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(inserted),
      },
      keywordSchedule: { createMany: vi.fn() },
      keywordTag: { createMany: vi.fn() },
      projectMarket: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({ publicId: "pmkt_1" }),
      },
      tag: { createMany: vi.fn(), findMany: vi.fn() },
    };

    const result = await createKeywordBatchSet(client as never, "project_1", [row(1), row(2)]);

    expect(result.created).toEqual(inserted);
    expect(mocks.seedKeywordDispatchStates).toHaveBeenCalledOnce();
    expect(mocks.seedKeywordDispatchStates).toHaveBeenCalledWith(
      ["keyword_1", "keyword_2"],
      {},
      client,
    );
  });

  it("skips an existing language pair while creating the same keyword in another pair", async () => {
    const existing = { ...stored(1), locationId: "location_es" };
    const english = { ...stored(2), locationId: "location_es_en", text: "keyword 1" };
    const client = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      keyword: {
        createMany: vi.fn(),
        findMany: vi.fn().mockResolvedValueOnce([existing]).mockResolvedValueOnce([english]),
      },
      keywordSchedule: { createMany: vi.fn() },
      keywordTag: { createMany: vi.fn(), findMany: vi.fn() },
      projectMarket: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({ publicId: "pmkt_1" }),
      },
      tag: { createMany: vi.fn(), findMany: vi.fn() },
    };
    const spanish = { ...row(1), location: "Malaga, Andalusia, Spain", locationId: "location_es" };
    const englishRow = {
      ...row(1),
      location: "Malaga, Andalusia, Spain (English)",
      locationId: "location_es_en",
    };

    const result = await createKeywordBatchSet(client as never, "project_1", [spanish, englishRow]);

    expect(result.accepted.map(({ created }) => created)).toEqual([false, true]);
    expect(result.created).toEqual([english]);
    expect(client.keyword.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ locationId: "location_es_en" })],
      skipDuplicates: true,
    });
  });

  it("rejects a new keyword market when the project registry is already at its cap", async () => {
    const client = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      keyword: { createMany: vi.fn(), findMany: vi.fn() },
      keywordSchedule: { createMany: vi.fn() },
      keywordTag: { createMany: vi.fn() },
      projectMarket: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            Array.from({ length: 5 }, (_, index) => ({ locationId: `location_${index}` })),
          ),
        upsert: vi.fn(),
      },
      tag: { createMany: vi.fn(), findMany: vi.fn() },
    };

    await expect(
      createKeywordBatchSet(client as never, "project_1", [
        { ...row(1), locationId: "location_6" },
      ]),
    ).rejects.toThrow("This project can track up to 5 markets.");
    expect(client.projectMarket.upsert).not.toHaveBeenCalled();
    expect(client.keyword.createMany).not.toHaveBeenCalled();
  });

  it("does not resume a paused market while creating its keyword", async () => {
    const inserted = [stored(1)];
    const client = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      keyword: {
        createMany: vi.fn(),
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(inserted),
      },
      keywordSchedule: { createMany: vi.fn() },
      keywordTag: { createMany: vi.fn() },
      projectMarket: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ locationId: "location_1", publicId: "pmkt_1", status: "paused" }]),
        upsert: vi.fn(),
      },
      tag: { createMany: vi.fn(), findMany: vi.fn() },
    };

    await createKeywordBatchSet(client as never, "project_1", [row(1)]);

    expect(client.projectMarket.upsert).not.toHaveBeenCalled();
    expect(client.keyword.createMany).toHaveBeenCalledOnce();
  });

  it("restores an archived tuple without creating a second row", async () => {
    const archivedAt = new Date("2026-09-04T20:00:00.000Z");
    const rows: Array<Omit<ReturnType<typeof stored>, "archivedAt"> & { archivedAt: Date | null }> =
      [{ ...stored(1), archivedAt }];
    const client = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      keyword: {
        count: vi.fn(async () => rows.length),
        createMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue(rows),
        updateMany: vi.fn(async () => {
          rows[0] = { ...rows[0], archivedAt: null };
          return { count: 1 };
        }),
      },
      keywordSchedule: { createMany: vi.fn() },
      keywordTag: { createMany: vi.fn() },
      projectMarket: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({ publicId: "pmkt_1" }),
      },
      tag: { createMany: vi.fn(), findMany: vi.fn() },
    };
    const before = await client.keyword.count();

    const result = await createKeywordBatchSet(client as never, "project_1", [row(1)]);
    const after = await client.keyword.count();

    expect([before, after]).toEqual([1, 1]);
    expect(result.accepted).toMatchObject([{ created: false, restored: true }]);
    expect(result.created).toEqual([]);
    expect(result.restored).toEqual([{ ...stored(1), archivedAt: null }]);
    expect(rows[0]?.archivedAt).toBeNull();
    expect(client.keyword.createMany).not.toHaveBeenCalled();
  });

  it("does not restore an archived tuple omitted from a heterogeneous batch", async () => {
    const archivedAt = new Date("2026-09-04T20:00:00.000Z");
    const crossed = {
      ...stored(3),
      // The restore mock below clears this, so the field has to stay nullable.
      archivedAt: archivedAt as Date | null,
      device: "mobile" as const,
      locationId: "location_de",
      text: "seo tools",
    };
    const inserted = [
      { ...stored(1), locationId: "location_es", text: "seo tools" },
      { ...stored(2), device: "mobile" as const, locationId: "location_de", text: "rank tracker" },
    ];
    const client = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      keyword: {
        createMany: vi.fn(),
        findMany: vi.fn().mockResolvedValueOnce([crossed]).mockResolvedValueOnce(inserted),
        updateMany: vi.fn(async () => {
          crossed.archivedAt = null;
          return { count: 1 };
        }),
      },
      keywordSchedule: { createMany: vi.fn() },
      keywordTag: { createMany: vi.fn() },
      projectMarket: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({ publicId: "pmkt_1" }),
      },
      tag: { createMany: vi.fn(), findMany: vi.fn() },
    };
    const requested = [
      { ...row(1), keyword: "seo tools", locationId: "location_es" },
      {
        ...row(2),
        device: "mobile" as const,
        keyword: "rank tracker",
        location: "Germany",
        locationId: "location_de",
      },
    ];

    const result = await createKeywordBatchSet(client as never, "project_1", requested);

    expect(crossed.archivedAt).toEqual(archivedAt);
    expect(result.restored).toEqual([]);
  });

  it("keeps an active tuple skipped without reporting a restore", async () => {
    const existing = stored(1);
    const client = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      keyword: {
        createMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([existing]),
        updateMany: vi.fn(),
      },
      keywordSchedule: { createMany: vi.fn() },
      keywordTag: { createMany: vi.fn() },
      projectMarket: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({ publicId: "pmkt_1" }),
      },
      tag: { createMany: vi.fn(), findMany: vi.fn() },
    };

    const result = await createKeywordBatchSet(client as never, "project_1", [row(1)]);

    expect(result.accepted).toMatchObject([{ created: false, restored: false }]);
    expect(result.created).toEqual([]);
    expect(result.restored).toEqual([]);
    expect(client.keyword.createMany).not.toHaveBeenCalled();
    expect(client.keyword.updateMany).not.toHaveBeenCalled();
  });
});
