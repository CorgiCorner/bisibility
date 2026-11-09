import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRetrievedResults } from "./retrieved-results";

const mocks = vi.hoisted(() => ({
  receipt: vi.fn(),
  getActionActor: vi.fn(),
  loadRetrievedResultsForChecks: vi.fn(),
  parseActionInput: vi.fn((schema: { parse: (v: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  ),
  requireProjectScope: vi.fn(),
}));

vi.mock("@/lib/activity/result-receipt-extension", () => ({ recordResultReceipt: mocks.receipt }));
vi.mock("@/lib/queries/retrieved-results", () => ({
  loadRetrievedResultsForChecks: mocks.loadRetrievedResultsForChecks,
}));
vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: mocks.parseActionInput,
  requireProjectScope: mocks.requireProjectScope,
}));

const PROJECT_PUBLIC_ID = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";

describe("loadRetrievedResults action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1" });
    mocks.loadRetrievedResultsForChecks.mockResolvedValue([]);
  });

  it("delegates to the query with the resolved project id", async () => {
    mocks.loadRetrievedResultsForChecks.mockResolvedValue([{ tier: "none" }]);

    const result = await loadRetrievedResults({
      checkIds: ["check_1"],
      projectId: PROJECT_PUBLIC_ID,
    });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      { id: "user_1" },
      "read",
      PROJECT_PUBLIC_ID,
      { type: "keyword" },
    );
    expect(mocks.loadRetrievedResultsForChecks).toHaveBeenCalledWith({
      checkIds: ["check_1"],
      projectId: "project_1",
    });
    expect(result).toEqual([{ tier: "none" }]);
  });

  it("rejects checkIds of length 0 through Zod", async () => {
    await expect(
      loadRetrievedResults({ checkIds: [], projectId: PROJECT_PUBLIC_ID }),
    ).rejects.toThrow();

    expect(mocks.getActionActor).not.toHaveBeenCalled();
  });

  it("rejects checkIds of length 3 through Zod", async () => {
    await expect(
      loadRetrievedResults({
        checkIds: ["check_1", "check_2", "check_3"],
        projectId: PROJECT_PUBLIC_ID,
      }),
    ).rejects.toThrow();

    expect(mocks.getActionActor).not.toHaveBeenCalled();
  });

  it("rejects an empty projectId through Zod", async () => {
    await expect(loadRetrievedResults({ checkIds: ["check_1"], projectId: "" })).rejects.toThrow();

    expect(mocks.getActionActor).not.toHaveBeenCalled();
  });

  it("calls requireProjectScope with read and rejects when it throws", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("Project not found."));

    await expect(
      loadRetrievedResults({ checkIds: ["check_1"], projectId: "prj_unknown" }),
    ).rejects.toThrow("Project not found.");

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      { id: "user_1" },
      "read",
      "prj_unknown",
      { type: "keyword" },
    );
    expect(mocks.loadRetrievedResultsForChecks).not.toHaveBeenCalled();
    expect(mocks.receipt).not.toHaveBeenCalled();
  });

  it("records a nonempty app result only after the authorized read", async () => {
    mocks.loadRetrievedResultsForChecks.mockResolvedValue([
      { tier: "full", checkedAt: "2026-11-05", rows: [{ position: 1 }] },
    ]);
    await loadRetrievedResults({ checkIds: ["check_1"], projectId: PROJECT_PUBLIC_ID });
    expect(mocks.receipt).toHaveBeenCalledWith({
      userId: "user_1",
      surface: "app",
      nonEmpty: true,
    });
    expect(mocks.loadRetrievedResultsForChecks.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.receipt.mock.invocationCallOrder[0],
    );
  });
  it("accepts exactly two checkIds", async () => {
    mocks.loadRetrievedResultsForChecks.mockResolvedValue([{ tier: "none" }, { tier: "none" }]);

    const result = await loadRetrievedResults({
      checkIds: ["check_1", "check_2"],
      projectId: PROJECT_PUBLIC_ID,
    });

    expect(result).toHaveLength(2);
    expect(mocks.loadRetrievedResultsForChecks).toHaveBeenCalledWith({
      checkIds: ["check_1", "check_2"],
      projectId: "project_1",
    });
  });
});
