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
});
