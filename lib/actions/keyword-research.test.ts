import { beforeEach, describe, expect, it, vi } from "vitest";
import { researchKeywordsAction } from "./keyword-research";

const connectionId = "conn_a00000000000000000000000";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  project: { id: "project_1", publicId: "prj_1" },
  research: vi.fn(),
  requireScope: vi.fn(),
}));

vi.mock("@/lib/keyword-research/service", () => ({ researchKeywords: mocks.research }));
vi.mock("./_shared", () => ({
  getActionActor: vi.fn(async () => mocks.actor),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
}));

describe("researchKeywordsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue(mocks.project);
  });

  it("authorizes project writes and passes estimate-only input through", async () => {
    const outcome = {
      cached: false,
      cachedUntil: "2026-07-22T22:00:00.000Z",
      connections: [],
      costCents: 3,
      estimate: true,
      fetchedAt: "2026-07-22T10:00:00.000Z",
      ok: true,
      provider: "DataForSEO",
      rows: [],
      sources: [],
    };
    mocks.research.mockResolvedValue(outcome);

    await expect(
      researchKeywordsAction({
        connectionId,
        estimateOnly: true,
        includeClickstream: true,
        maxCostCents: 8,
        mode: "ideas",
        projectId: "prj_1",
        resultLimit: 300,
        seed: " rank tracker ",
      }),
    ).resolves.toEqual(outcome);

    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "create", "prj_1", {
      type: "keyword",
    });
    expect(mocks.research).toHaveBeenCalledWith({
      actorId: "user_1",
      connectionId,
      estimateOnly: true,
      fresh: false,
      includeClickstream: true,
      maxCostCents: 8,
      mode: "ideas",
      projectId: "project_1",
      resultLimit: 300,
      seed: "rank tracker",
    });
  });

  it.each([
    "budget_exhausted",
    "cost_limit_exceeded",
    "in_progress",
    "needs_reauth",
    "no_source",
    "rate_limited",
    "unsupported_location",
  ] as const)("returns the %s outcome unchanged", async (reason) => {
    mocks.research.mockResolvedValue({ ok: false, reason });

    await expect(researchKeywordsAction({ projectId: "prj_1", seed: "seo" })).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it("rejects invalid inputs before authorizing", async () => {
    await expect(
      researchKeywordsAction({ projectId: "prj_1", resultLimit: 200, seed: "" }),
    ).rejects.toThrow();
    expect(mocks.requireScope).not.toHaveBeenCalled();
    expect(mocks.research).not.toHaveBeenCalled();
  });

  it.each(["connection_1", "key_a00000000000000000000000"])(
    "rejects connection ID %s before authorization",
    async (invalidId) => {
      await expect(
        researchKeywordsAction({
          connectionId: invalidId,
          projectId: "prj_1",
          seed: "seo",
        }),
      ).rejects.toThrow();
      expect(mocks.requireScope).not.toHaveBeenCalled();
      expect(mocks.research).not.toHaveBeenCalled();
    },
  );
});
