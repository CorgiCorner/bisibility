import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRankedKeywordSuggestions } from "./ranked-keywords";

const connectionId = "conn_a00000000000000000000000";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getActor: vi.fn(),
  requireScope: vi.fn(),
}));

vi.mock("@/lib/ranked-keywords/service", () => ({ fetchRankedKeywords: mocks.fetch }));
vi.mock("./_shared", () => ({
  getActionActor: mocks.getActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
}));

describe("fetchRankedKeywordSuggestions action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActor.mockResolvedValue({ id: "user_1" });
    mocks.requireScope.mockResolvedValue({ id: "project_1" });
  });

  it("authorizes read access and delegates validated pagination", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, reason: "no_source" });
    await expect(
      fetchRankedKeywordSuggestions({
        connectionId,
        offset: 100,
        projectId: "prj_1",
      }),
    ).resolves.toEqual({ reason: "no_source" });
    expect(mocks.requireScope).toHaveBeenCalledWith({ id: "user_1" }, "read", "prj_1", {
      type: "project",
    });
    expect(mocks.fetch).toHaveBeenCalledWith({
      actorId: "user_1",
      connectionId,
      limit: 100,
      offset: 100,
      projectId: "project_1",
    });
  });

  it("rejects non-page-aligned offsets", async () => {
    await expect(
      fetchRankedKeywordSuggestions({ offset: 50, projectId: "prj_1" }),
    ).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["connection_1", "key_a00000000000000000000000"])(
    "rejects connection ID %s before authorization",
    async (invalidId) => {
      await expect(
        fetchRankedKeywordSuggestions({
          connectionId: invalidId,
          projectId: "prj_1",
        }),
      ).rejects.toThrow();
      expect(mocks.requireScope).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
});
