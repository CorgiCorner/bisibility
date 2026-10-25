import { AuthorizationError } from "@/lib/auth/authorize";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  scope: vi.fn(),
  state: vi.fn(),
  lookup: vi.fn(),
  accept: vi.fn(),
  audit: vi.fn(),
  locale: vi.fn(),
}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.locale,
}));
const actor = { id: "editor", memberships: [{ projectId: "project", role: "admin" }] };
const project = {
  id: "project",
  publicId: "prj_public",
  domain: "example.com",
  writeMode: "active",
};
vi.mock("@/lib/ai-research/context", () => ({ requireAiSource: mocks.source }));
vi.mock("./_shared", () => ({ getActionActor: async () => actor }));
vi.mock("@/lib/api/ai-tracking-service", () => ({ trackingScope: mocks.scope }));
vi.mock("@/lib/ai-research/service", () => ({ researchAiQuestions: mocks.lookup }));
vi.mock("@/lib/ai-research/prompt-research-project", () => ({ researchProjectState: mocks.state }));
vi.mock("@/lib/ai-research/prompt-research-accept", () => ({
  acceptResearchedPrompts: mocks.accept,
}));
vi.mock("@/lib/api/ai-tracking-audit", () => ({
  auditTrackingAcceptance: mocks.audit,
  auditTrackingCatalog: mocks.audit,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getPromptResearchPage,
  lookupPromptResearchAction,
  trackPromptResearchAction,
} from "./prompt-research";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.source.mockResolvedValue({});
  mocks.locale.mockResolvedValue({ locale: "en" });
  actor.memberships[0].role = "admin";
  mocks.scope.mockResolvedValue(project);
  mocks.state.mockResolvedValue({
    brand: "Example",
    domain: "example.com",
    tracked: [],
    topics: [],
    keywords: ["tools"],
  });
  mocks.lookup.mockResolvedValue({ ok: false, reason: "cost_limit_exceeded", message: "No cache" });
});
it("reads relevant keywords freely and attempts only cache access for q", async () => {
  expect(await getPromptResearchPage("prj_public")).toEqual({
    canWrite: true,
    hasSource: true,
    cacheDuration: "12 hours",
    supportingProviders: ["DataForSEO"],
    topics: [],
    keywords: ["tools"],
    initial: undefined,
  });
  expect(mocks.scope).toHaveBeenCalledWith(actor, "prj_public");
  expect(mocks.lookup).not.toHaveBeenCalled();
  await getPromptResearchPage("prj_public", "tools");
  expect(mocks.lookup).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: "project", actorId: "editor" }),
    expect.objectContaining({ keyword: "tools", max_cost_cents: 0, require_payment: true }),
  );
});
it("keeps readers read-only without running research", async () => {
  actor.memberships[0].role = "viewer";
  expect(await getPromptResearchPage("prj_public", "tools")).toMatchObject({ canWrite: false });
  expect(mocks.lookup).not.toHaveBeenCalled();
});
it.each(["lookup", "accept"])(
  "authorizes %s with the same write scope as Prompt Tracker",
  async (operation) => {
    mocks.scope.mockRejectedValue(new AuthorizationError("forbidden"));
    const call =
      operation === "lookup"
        ? lookupPromptResearchAction("prj_public", { keyword: "tools", max_cost_cents: 50 })
        : trackPromptResearchAction("prj_public", {});
    await expect(call).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.scope).toHaveBeenCalledWith(actor, "prj_public", true);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  },
);
it("recomputes live tracked/brand/domain flags on every cached read", async () => {
  mocks.lookup.mockResolvedValue({
    ok: true,
    estimate: false,
    cached: true,
    reportId: "report",
    costCents: 0,
    result: {
      rows: [
        {
          prompt: "best tools?",
          answer: "Example",
          model: "chat_gpt",
          observedAt: null,
          brandMentioned: false,
          domainCited: false,
          citations: [{ url: "https://example.com/", title: "Home", targetDomain: false }],
        },
      ],
    },
  });
  const input = { keyword: "tools", max_cost_cents: 0 };
  expect(await lookupPromptResearchAction("prj_public", input)).toMatchObject({
    costCents: 0,
    prompts: [
      expect.objectContaining({ tracked: false, brandMentioned: true, ownDomainCited: true }),
    ],
  });
  mocks.state.mockResolvedValue({
    brand: "Absent",
    domain: "absent.com",
    tracked: ["best tools?"],
    topics: [],
    keywords: [],
  });
  expect(await lookupPromptResearchAction("prj_public", input)).toMatchObject({
    prompts: [
      expect.objectContaining({ tracked: true, brandMentioned: false, ownDomainCited: false }),
    ],
  });
});
it("returns free tracker updates after acceptance and records audit without another lookup", async () => {
  mocks.accept.mockResolvedValue({ added: 2, state: { topics: [], tracked: ["one", "two"] } });
  expect(await trackPromptResearchAction("prj_public", {})).toEqual({
    added: 2,
    topics: [],
    tracked: ["one", "two"],
  });
  expect(mocks.audit).toHaveBeenCalledWith(actor, project, 2);
  expect(mocks.lookup).not.toHaveBeenCalled();
});

it("gates the page without a provider call when source resolution refuses", async () => {
  const { ProviderLookupSignal } = await import("@/lib/provider-lookups/paid-call");
  mocks.source.mockRejectedValue(new ProviderLookupSignal({ ok: false, reason: "no_source" }));
  expect(await getPromptResearchPage("prj_public", "tools")).toMatchObject({
    hasSource: false,
    initial: undefined,
  });
  expect(mocks.source).toHaveBeenCalledWith("project");
  expect(mocks.lookup).not.toHaveBeenCalled();
});
it("does not disguise a source database failure as missing integration", async () => {
  mocks.source.mockRejectedValue(new Error("Database unavailable"));
  await expect(getPromptResearchPage("prj_public")).rejects.toThrow("Database unavailable");
});

it("formats the effective project lifetime on the server even without a source", async () => {
  const state = await mocks.state();
  mocks.state.mockResolvedValue({ ...state, lookupCacheTtlSeconds: 604800 });
  expect(await getPromptResearchPage("prj_public")).toMatchObject({ cacheDuration: "7 days" });
  const { ProviderLookupSignal } = await import("@/lib/provider-lookups/paid-call");
  mocks.source.mockRejectedValue(new ProviderLookupSignal({ ok: false, reason: "no_source" }));
  expect(await getPromptResearchPage("prj_public")).toMatchObject({ cacheDuration: "7 days" });
});

it.each([
  ["en", "12 hours"],
  ["pl", "12 godzin"],
  ["es-ES", "12 horas"],
  ["ja", "12時間"],
])("loads the duration catalog explicitly for %s", async (locale, cacheDuration) => {
  mocks.locale.mockResolvedValue({ locale });
  expect(await getPromptResearchPage("prj_public")).toMatchObject({ cacheDuration });
});
