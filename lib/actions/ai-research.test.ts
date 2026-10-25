vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn() }));
vi.mock("@/lib/ai-research/history-payment", () => ({ aiHistoryPayments: async () => new Map() }));

import { AuthorizationError } from "@/lib/auth/authorize";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { notFound } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectNotFoundError } from "./_shared";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  analyze: vi.fn(),
  compare: vi.fn(),
  history: vi.fn(),
  catalog: vi.fn(),
  record: vi.fn(),
  ProjectNotFoundError: class extends Error {},
}));
vi.mock("@/lib/achievements/record-use", () => ({ recordQualifiedUse: mocks.record }));
vi.mock("./_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
  ProjectNotFoundError: mocks.ProjectNotFoundError,
}));
vi.mock("@/lib/ai-research/catalog-service", () => ({ getAiResearchCatalog: mocks.catalog }));
vi.mock("@/lib/ai-research/service", () => ({
  analyzeAiVisibility: mocks.analyze,
  compareAiPrompts: mocks.compare,
}));
vi.mock("@/lib/agent-reports/service", () => ({ listAgentReports: mocks.history }));

import {
  analyzeAiResearchAction,
  getAiResearchCatalogAction,
  getAiResearchPage,
} from "./ai-research";

beforeEach(() => {
  vi.clearAllMocks();
  notFound.mockImplementation(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  });
  mocks.actor.mockResolvedValue({ id: "actor" });
  mocks.scope.mockResolvedValue({ id: "internal-project" });
  mocks.analyze.mockResolvedValue({ ok: false, reason: "no_source", message: "Connect a source." });
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
  it("carries a missing catalog source to the page without losing saved reports", async () => {
    mocks.catalog.mockResolvedValue({
      ok: false,
      reason: "no_source",
      message: "Connect a provider.",
    });
    mocks.history.mockResolvedValue([{ id: "agr_saved", title: "Saved report" }]);
    mocks.scope.mockResolvedValue({
      id: "internal-project",
      domain: "acme.com",
      writeMode: "active",
    });
    const page = await getAiResearchPage("prj_public", "visibility");
    expect(page).toMatchObject({
      catalog: undefined,
      catalogFailure: "no_source",
      supportingProviders: ["DataForSEO"],
      history: [{ id: "agr_saved" }],
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

it("preserves missing-budget guidance in the research action result", async () => {
  mocks.analyze.mockRejectedValueOnce(
    new DeploymentAdmissionExhaustedError("budget", { budgetReason: "budget_missing" }),
  );
  await expect(analyzeAiResearchAction("prj_public", "visibility", input)).resolves.toMatchObject({
    ok: false,
    reason: "budget_missing",
    message: expect.stringContaining("configure a monthly budget"),
  });
});

it.each(["visibility", "prompt"] as const)(
  "authorizes %s research with a long local matching domain",
  async (mode) => {
    const domain = `${"a".repeat(50)}.${"b".repeat(12)}.example.com`;
    await analyzeAiResearchAction("prj_public", mode, {
      ...input,
      domain,
      ...(mode === "prompt" ? { prompt: "q" } : { target_type: "brand" }),
    });
    expect(mocks.scope).toHaveBeenCalledWith({ id: "actor" }, "create", "prj_public", {
      type: "project",
    });
    expect(mode === "prompt" ? mocks.compare : mocks.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "internal-project" }),
      expect.objectContaining({ domain }),
    );
  },
);
it("rejects unsupported provider domain mode before authorization or paid service I/O", async () => {
  await expect(
    analyzeAiResearchAction("prj_public", "visibility", {
      ...input,
      domain: `${"a".repeat(50)}.${"b".repeat(12)}.example.com`,
    }),
  ).rejects.toThrow(/Domain searches support at most 63 characters/);
  expect(mocks.actor).not.toHaveBeenCalled();
  expect(mocks.analyze).not.toHaveBeenCalled();
});

it("excludes estimate-only AI results from practice attribution", async () => {
  mocks.analyze.mockResolvedValue({ ok: true, costCents: 0 });
  await analyzeAiResearchAction("prj_public", "visibility", { ...input, estimate_only: true });
  expect(mocks.record).toHaveBeenCalledWith({
    actorId: "actor",
    operation: "runAiResearch",
    estimate: true,
    success: true,
  });
});

describe("AI page access failures", () => {
  it.each(["visibility", "prompt"] as const)(
    "renders not-found for a forbidden %s page before loading data",
    async (mode) => {
      mocks.scope.mockRejectedValueOnce(new AuthorizationError("forbidden"));
      await expect(getAiResearchPage("prj_foreign", mode)).rejects.toThrow(
        "NEXT_HTTP_ERROR_FALLBACK;404",
      );
      expect(notFound).toHaveBeenCalledOnce();
      expect(mocks.history).not.toHaveBeenCalled();
      expect(mocks.catalog).not.toHaveBeenCalled();
    },
  );
  it.each(["visibility", "prompt"] as const)(
    "renders not-found for a missing %s project before loading data",
    async (mode) => {
      mocks.scope.mockRejectedValueOnce(new ProjectNotFoundError());
      await expect(getAiResearchPage("prj_missing", mode)).rejects.toThrow(
        "NEXT_HTTP_ERROR_FALLBACK;404",
      );
      expect(notFound).toHaveBeenCalledOnce();
      expect(mocks.history).not.toHaveBeenCalled();
      expect(mocks.catalog).not.toHaveBeenCalled();
    },
  );
  it("preserves authentication failures", async () => {
    const failure = new AuthorizationError("unauthenticated");
    mocks.actor.mockRejectedValueOnce(failure);
    await expect(getAiResearchPage("prj_public", "visibility")).rejects.toBe(failure);
    expect(notFound).not.toHaveBeenCalled();
    expect(mocks.scope).not.toHaveBeenCalled();
  });
  it("preserves unexpected database failures", async () => {
    const failure = new Error("Database unavailable");
    mocks.scope.mockRejectedValueOnce(failure);
    await expect(getAiResearchPage("prj_public", "visibility")).rejects.toBe(failure);
    expect(notFound).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("does not conceal failures after project authorization", async () => {
    const failure = new AuthorizationError("forbidden");
    mocks.history.mockRejectedValueOnce(failure);
    await expect(getAiResearchPage("prj_public", "visibility")).rejects.toBe(failure);
    expect(notFound).not.toHaveBeenCalled();
  });
  it("keeps catalog actions on the typed authorization error contract", async () => {
    const failure = new AuthorizationError("forbidden");
    mocks.scope.mockRejectedValueOnce(failure);
    await expect(getAiResearchCatalogAction("prj_foreign")).rejects.toBe(failure);
    expect(notFound).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
});
