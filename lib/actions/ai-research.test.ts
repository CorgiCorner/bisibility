import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  analyze: vi.fn(),
  compare: vi.fn(),
  history: vi.fn(),
  catalog: vi.fn(),
}));
vi.mock("./_shared", () => ({ getActionActor: mocks.actor, requireProjectScope: mocks.scope }));
vi.mock("@/lib/ai-research/catalog-service", () => ({ getAiResearchCatalog: mocks.catalog }));
vi.mock("@/lib/ai-research/service", () => ({
  analyzeAiVisibility: mocks.analyze,
  compareAiPrompts: mocks.compare,
}));
vi.mock("@/lib/agent-reports/service", () => ({ listAgentReports: mocks.history }));

import { analyzeAiResearchAction, getAiResearchCatalogAction } from "./ai-research";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "actor" });
  mocks.scope.mockResolvedValue({ id: "internal-project" });
});
const input = { brand: "Acme", domain: "acme.com", max_cost_cents: 60 };
describe("AI action authorization", () => {
  it("authorizes free catalog reads on the scoped internal project", async () => {
    mocks.catalog.mockResolvedValue({ ok: true, catalog: { models: [] } });
    await expect(getAiResearchCatalogAction("prj_public")).resolves.toMatchObject({ ok: true });
    expect(mocks.scope).toHaveBeenCalledWith({ id: "actor" }, "read", "prj_public", {
      type: "project",
    });
    expect(mocks.catalog).toHaveBeenCalledWith("internal-project");
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("does not fetch a free catalog without project access", async () => {
    mocks.scope.mockRejectedValue(new Error("Project denied"));
    await expect(getAiResearchCatalogAction("prj_foreign")).rejects.toThrow("denied");
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("checks project create permission and write hold before paid analysis", async () => {
    mocks.scope.mockRejectedValue(new Error("Project is read-only"));
    await expect(analyzeAiResearchAction("prj_public", "visibility", input)).rejects.toThrow(
      "read-only",
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.scope).toHaveBeenCalledWith({ id: "actor" }, "create", "prj_public", {
      type: "project",
    });
  });
  it("rejects overlong provider prompts before authorization or I/O", async () => {
    await expect(
      analyzeAiResearchAction("prj_public", "prompt", { ...input, prompt: "a".repeat(501) }),
    ).rejects.toThrow();
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("uses scoped internal identity and actor attribution for the service", async () => {
    await analyzeAiResearchAction("prj_public", "visibility", input);
    expect(mocks.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "internal-project", actorId: "actor" }),
      expect.objectContaining(input),
    );
  });
});
