import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  capabilities: vi.fn(),
  paid: vi.fn(),
  preflight: vi.fn(),
  report: vi.fn(),
  cache: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/live-capacity", () => ({
  reserveLiveResponseCapacity: vi.fn(),
  assertLiveResponseCapacity: vi.fn(),
}));
vi.mock("./context", () => ({ requireAiSource: mocks.source }));
vi.mock("./catalog-service", () => ({
  loadAiResearchCapabilities: mocks.capabilities,
  getAiResearchCatalog: vi.fn(),
}));
vi.mock("@/lib/agent-reports/service", () => ({ createAgentReport: mocks.report }));
vi.mock("@/lib/provider-lookups/cache", () => ({ withProviderLookupCache: mocks.cache }));
vi.mock("@/lib/provider-lookups/paid-call", async () => ({
  ProviderLookupSignal: (await import("@/lib/provider-lookups/lookup-failure"))
    .ProviderLookupSignal,
  paidProviderCall: mocks.paid,
  preflightProviderBudget: mocks.preflight,
}));

import { postPromptExplorer } from "@/lib/api/ai-research";
import type { ApiContext } from "@/lib/api/context";
import { dispatchResearchWorkspaceTool } from "@/lib/mcp/research-workspace-tools";
import { capabilities } from "./catalog-fixtures.test-support";
import { analyzeAiVisibility, compareAiPrompts } from "./service";

const context = { projectId: "internal-project", origin: { source: "app" as const } };
const input = {
  brand: "Acme",
  domain: "acme.com",
  prompt: "Odpowiedz po polsku: Acme?",
  max_cost_cents: 60,
};
const cache = new Map<string, unknown>();
beforeEach(() => {
  vi.clearAllMocks();
  cache.clear();
  mocks.source.mockResolvedValue({
    project: { id: context.projectId, budgetCapCents: 100 },
    connection: {
      id: "connection",
      provider: "dataforseo",
      credentialSource: "own",
      credentialsEncrypted: "fictional-reference",
    },
    provider: { id: "dataforseo" },
  });
  mocks.capabilities.mockRejectedValue(new Error("Fictional pricing/catalog outage"));
  mocks.report.mockResolvedValue({ id: "agr_a00000000000000000000000" });
  mocks.cache.mockImplementation(async ({ key, fresh, load }) => {
    if (!fresh && cache.has(key)) return { status: "success", cached: true, value: cache.get(key) };
    const value = await load();
    cache.set(key, value);
    return { status: "success", cached: false, value };
  });
  mocks.paid.mockImplementation(({ call }) =>
    call({ login: "fixture", password: "fictional" }, { tag: "fictional-usage-tag" }),
  );
  mocks.fetch.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/models"))
      return Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: ["gpt-4.1-mini", "gpt-4.1-nano"].map((model_name) => ({
              model_name,
              reasoning: false,
            })),
          },
        ],
      });
    if (options?.method !== "POST") throw new Error("Unexpected new metadata request");
    const payload = JSON.parse(String(options.body))[0];
    return Response.json({
      status_code: 20000,
      cost: 0.001,
      tasks: [
        {
          id: "fictional-receipt",
          status_code: 20000,
          cost: 0.001,
          result: [
            payload.model_name
              ? {
                  model_name: payload.model_name,
                  items: [{ type: "message", sections: [{ text: "Acme", annotations: [] }] }],
                }
              : { total_count: 0, items: [] },
          ],
        },
      ],
    });
  });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());
describe("Approved legacy availability without new catalog dependency", () => {
  it.each(["outage", "drift", "stale"])(
    "keeps omitted-model mini/nano512 available during new-source %s",
    async (fault) => {
      if (fault === "drift")
        mocks.capabilities.mockResolvedValue({ ...capabilities, modelRates: new Map() });
      if (fault === "stale")
        mocks.capabilities.mockResolvedValue({
          ...capabilities,
          modelRates: new Map(
            [...capabilities.modelRates].map(([model, rate]) => [
              model,
              { ...rate, checkedAt: "2026-10-02T00:00:00Z" },
            ]),
          ),
        });
      expect(await compareAiPrompts(context, { ...input, estimate_only: true })).toMatchObject({
        ok: true,
        estimatedCostCents: 52.6013,
        pricingPolicy: "legacy_dated",
        pricingCheckedAt: "2026-10-02",
        isGuaranteedMaximum: false,
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(await compareAiPrompts(context, input)).toMatchObject({
        ok: true,
        costCents: 0.2,
        result: {
          rows: [{ model: "gpt-4.1-mini" }, { model: "gpt-4.1-nano" }],
          costStatus: "confirmed",
        },
      });
      expect(mocks.capabilities).not.toHaveBeenCalled();
      expect(
        mocks.fetch.mock.calls.filter(([, options]) => options?.method !== "POST"),
      ).toHaveLength(1);
      for (const [, options] of mocks.fetch.mock.calls.filter(
        ([, options]) => options?.method === "POST",
      ))
        expect(JSON.parse(String(options?.body))[0]).toEqual({
          user_prompt: input.prompt,
          model_name: expect.stringMatching(/^gpt-4\.1-(?:mini|nano)$/),
          max_output_tokens: 512,
          web_search: false,
          temperature: 0,
          tag: "fictional-usage-tag",
        });
      expect(mocks.report.mock.calls[0][0].provenance).toMatchObject({
        pricingPolicy: "legacy_dated",
        pricingCheckedAt: "2026-10-02",
        admissionBoundCents: 52.6013,
      });
      expect(await compareAiPrompts(context, { ...input, max_output_tokens: 4096 })).toMatchObject({
        ok: false,
        reason: "pricing_unavailable",
      });
      expect(mocks.paid).toHaveBeenCalledTimes(2);
    },
  );
  it("reuses the exact pre-release v1 identity without metadata, preflight or paid I/O", async () => {
    const identity = {
      brand: input.brand,
      domain: input.domain,
      prompt: input.prompt,
      models: ["gpt-4.1-mini", "gpt-4.1-nano"],
    };
    const key = `ai:v1:internal-project:connection:prompt_explorer:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
    cache.set(key, {
      reportId: "agr_a00000000000000000000000",
      result: {
        evidence: "synthetic_prompt_test",
        rows: [],
        totalAvailable: null,
        truncated: false,
        fetchedAt: "2026-10-02T00:00:00Z",
        costCents: 0.2,
        costStatus: "confirmed",
        failure: null,
      },
    });
    expect(await compareAiPrompts(context, { ...input, max_cost_cents: 0 })).toMatchObject({
      ok: true,
      cached: true,
      costCents: 0,
    });
    expect(mocks.capabilities).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("refuses hard-cap snapshots, new reasoning models and search before paid admission", async () => {
    for (const options of [
      { models: ["gpt-4.1-mini-2025-04-14"] },
      { models: ["gpt-5-mini"] },
      { models: ["o4-mini"], max_output_tokens: 1024 },
      { web_search: true },
    ])
      expect(await compareAiPrompts(context, { ...input, ...options })).toMatchObject({
        ok: false,
      });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.capabilities).not.toHaveBeenCalled();
  });
  it("retains the original nonreasoning guard and does not POST a drifted legacy alias", async () => {
    mocks.fetch.mockResolvedValueOnce(
      Response.json({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ model_name: "gpt-4.1-mini", reasoning: true }] }],
      }),
    );
    await expect(compareAiPrompts(context, { ...input, models: ["gpt-4.1-mini"] })).rejects.toThrow(
      "bounded responses",
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("preserves only original ChatGPT US/en observed admission without new metadata", async () => {
    const { prompt: _prompt, ...visibility } = input;
    expect(
      await analyzeAiVisibility(context, { ...visibility, estimate_only: true }),
    ).toMatchObject({ ok: true, estimatedCostCents: 11 });
    expect(await analyzeAiVisibility(context, visibility)).toMatchObject({
      ok: true,
      result: { evidence: "observed_dataset" },
    });
    expect(mocks.capabilities).not.toHaveBeenCalled();
    expect(
      await analyzeAiVisibility(context, {
        ...visibility,
        platform: "google",
        location_code: 2616,
        language_code: "pl",
      }),
    ).toMatchObject({ ok: false, reason: "pricing_unavailable" });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
  });
  it.each(["REST", "MCP"])(
    "honors omitted-model/default512 through %s during source outage",
    async (surface) => {
      const publicId = "prj_a00000000000000000000000";
      const routed =
        surface === "MCP"
          ? dispatchResearchWorkspaceTool("compareAiPrompts", { project_id: publicId, ...input })!
          : { body: input };
      const req = new Request("http://fixture.invalid", {
        method: "POST",
        body: JSON.stringify(routed.body),
      });
      const response = await postPromptExplorer(
        {
          req,
          headers: new Headers(),
          instance: "/fixture",
          auth: { project: { id: context.projectId, publicId } },
          origin: {
            source: surface === "MCP" ? "mcp" : "api",
            credentialKind: "project_key",
            credentialId: "fictional-key",
          },
        } as ApiContext,
        publicId,
      );
      expect(response.status).toBe(200);
      expect((await response.json()).data.result.rows).toHaveLength(2);
      expect(mocks.capabilities).not.toHaveBeenCalled();
    },
  );
});
