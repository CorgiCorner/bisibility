import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeBacklinksAction, loadMoreBacklinkRowsAction } from "./backlinks";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  analyze: vi.fn(),
  loadMore: vi.fn(),
  project: { id: "project_1", publicId: "prj_1" },
  requireScope: vi.fn(),
}));

vi.mock("@/lib/backlinks/service", () => ({
  analyzeBacklinks: mocks.analyze,
  loadMoreBacklinkRows: mocks.loadMore,
}));
vi.mock("./_shared", () => ({
  getActionActor: vi.fn(async () => mocks.actor),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
}));

describe("backlinks actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue(mocks.project);
  });

  it("authorizes and delegates a validated analysis", async () => {
    const outcome = { ok: false, reason: "budget_exhausted" };
    mocks.analyze.mockResolvedValue(outcome);

    await expect(
      analyzeBacklinksAction({
        estimateOnly: true,
        includeSubdomains: false,
        maxCostCents: 8,
        mode: "one_per_domain",
        projectId: "prj_1",
        resultLimit: 300,
        target: " example.com ",
        targetScope: "site",
      }),
    ).resolves.toBe(outcome);

    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "create", "prj_1", {
      type: "project",
    });
    expect(mocks.analyze).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      {
        estimateOnly: true,
        fresh: false,
        includeSubdomains: false,
        maxCostCents: 8,
        mode: "one_per_domain",
        resultLimit: 300,
        target: "example.com",
        targetScope: "site",
      },
    );
  });

  it("accepts a zero maximum cost", async () => {
    mocks.analyze.mockResolvedValue({ ok: false, reason: "cost_limit_exceeded" });

    await analyzeBacklinksAction({
      maxCostCents: 0,
      projectId: "prj_1",
      target: "example.com",
    });

    expect(mocks.analyze).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      expect.objectContaining({ maxCostCents: 0 }),
    );
  });

  it("authorizes and delegates validated load-more input", async () => {
    const outcome = { ok: false, reason: "rate_limited" };
    mocks.loadMore.mockResolvedValue(outcome);

    await expect(
      loadMoreBacklinkRowsAction({
        includeSubdomains: true,
        limit: 500,
        projectId: "prj_1",
        target: "example.com",
        targetScope: "site",
      }),
    ).resolves.toBe(outcome);

    expect(mocks.loadMore).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      {
        includeSubdomains: true,
        limit: 500,
        target: "example.com",
        targetScope: "site",
      },
    );
  });

  it("denies a foreign project before calling either service", async () => {
    mocks.requireScope.mockRejectedValue(new Error("You are not authorized."));

    await expect(
      analyzeBacklinksAction({ projectId: "prj_foreign", target: "example.com" }),
    ).rejects.toThrow("not authorized");
    await expect(
      loadMoreBacklinkRowsAction({
        includeSubdomains: true,
        limit: 100,
        projectId: "prj_foreign",
        target: "example.com",
        targetScope: "site",
      }),
    ).rejects.toThrow("not authorized");
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.loadMore).not.toHaveBeenCalled();
  });

  it("rejects invalid inputs before authorization", async () => {
    await expect(
      analyzeBacklinksAction({
        maxCostCents: -1,
        projectId: "prj_1",
        resultLimit: 200,
        target: "",
      }),
    ).rejects.toThrow();
    await expect(
      loadMoreBacklinkRowsAction({
        includeSubdomains: true,
        limit: 150,
        projectId: "prj_1",
        target: "example.com",
        targetScope: "site",
      }),
    ).rejects.toThrow();
    expect(mocks.requireScope).not.toHaveBeenCalled();
  });
});
