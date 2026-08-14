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
});
