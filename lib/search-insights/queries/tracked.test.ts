import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findKeywordMatches: vi.fn() }));

vi.mock("@/lib/queries/keyword-matches", () => ({ findKeywordMatches: mocks.findKeywordMatches }));

const { trackedKey } = await import("./tracked-model");

const { getTrackedQueryTexts } = await import("./tracked");

describe("getTrackedQueryTexts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findKeywordMatches.mockResolvedValue({
      matches: [
        { matchedText: "open source rank tracker" },
        { matchedText: "open source rank tracker" },
        { matchedText: "rank tracker api" },
      ],
      truncatedTexts: [],
    });
  });

  it("collapses the per-market matches into one answer per text", async () => {
    const tracked = await getTrackedQueryTexts("project_1", [
      "Open Source Rank Tracker",
      "rank tracker api",
    ]);

    expect([...tracked]).toEqual(["open source rank tracker", "rank tracker api"]);
    expect(mocks.findKeywordMatches).toHaveBeenCalledWith("project_1", [
      "Open Source Rank Tracker",
      "rank tracker api",
    ]);
  });

  it("agrees with the key a row is looked up by", async () => {
    const tracked = await getTrackedQueryTexts("project_1", ["Open Source Rank Tracker"]);

    expect(tracked.has(trackedKey("  Open Source Rank Tracker "))).toBe(true);
  });

  it("asks nothing of the database for an empty table", async () => {
    await expect(getTrackedQueryTexts("project_1", [])).resolves.toEqual(new Set());
    expect(mocks.findKeywordMatches).not.toHaveBeenCalled();
  });
});
