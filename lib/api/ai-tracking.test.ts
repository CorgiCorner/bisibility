import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  catalog: vi.fn(),
  launch: vi.fn(),
  mutate: vi.fn(),
  samples: vi.fn(),
  runs: vi.fn(),
  run: vi.fn(),
  operation: vi.fn(),
  revisions: vi.fn(),
  topics: vi.fn(),
  prompts: vi.fn(),
}));
vi.mock("./ai-tracking-service", () => ({
  trackingScope: mocks.scope,
  trackingCatalog: mocks.catalog,
  mutateTrackingCatalog: mocks.mutate,
  trackingLaunch: mocks.launch,
  trackingSamples: mocks.samples,
  trackingRuns: mocks.runs,
  trackingRun: mocks.run,
  trackingRunOperation: mocks.operation,
  trackingRevisions: mocks.revisions,
}));
vi.mock("@/lib/ai-tracking/stores/topics", () => ({ listTopics: mocks.topics }));
vi.mock("@/lib/ai-tracking/stores/prompts", () => ({ listPrompts: mocks.prompts }));
vi.mock("./ai-tracking-audit", () => ({
  auditTrackingCatalog: vi.fn(),
  auditTrackingRun: vi.fn(),
  auditTrackingAcceptance: vi.fn(),
}));
vi.mock("./ai-tracking-trends", () => ({ trackingTrends: vi.fn() }));
vi.mock("./ai-tracking-suggestions", () => ({ handleAiTrackingSuggestionGeneration: vi.fn() }));

import { aiTrackingRoute } from "./ai-tracking";
import type { ApiScope } from "./auth";
import type { ApiContext } from "./context";

function context(
  method: string,
  suffix: string[],
  body: unknown = {},
  headers: Record<string, string> = {},
  scopes: readonly ApiScope[] = ["read", "write"],
): ApiContext {
  const url = new URL(
    `https://example.test/api/v1/projects/prj_public/ai-tracking/${suffix.join("/")}`,
  );
  return {
    method,
    path: ["projects", "prj_public", "ai-tracking", ...suffix],
    req: new Request(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      ...(method === "GET" || method === "DELETE" ? {} : { body: JSON.stringify(body) }),
    }),
    url,
    headers: new Headers(),
    instance: "test",
    actor: { id: "trusted_actor" },
    origin: {
      source: "mcp",
      credentialId: "trusted_key",
      credentialKind: "project_key",
      surface: "programmatic",
    },
    auth: {
      apiKey: {
        id: "trusted_key",
        name: "Tracking test key",
        prefix: "bsb_key_test",
        projectId: "internal_project",
        scopes,
      },
      project: {
        id: "internal_project",
        publicId: "prj_public",
        name: "Tracking test project",
        domain: "example.test",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockResolvedValue({ id: "internal_project" });
  mocks.topics.mockResolvedValue([]);
  mocks.prompts.mockResolvedValue([]);
});
describe("tracking project REST boundary", () => {
  it("returns public topic identities without internal project IDs", async () => {
    mocks.catalog.mockResolvedValue([
      {
        id: "internal",
        publicId: "ait_public",
        projectId: "internal_project",
        name: "Topic",
        description: null,
      },
    ]);
    const response = await aiTrackingRoute(context("GET", ["topics"]));
    const payload = await response?.json();
    expect(payload.data[0]).toMatchObject({ id: "ait_public", name: "Topic" });
    expect(payload.data[0]).not.toHaveProperty("project_id");
    expect(payload.data[0]).not.toHaveProperty("public_id");
  });
  it("runs previews with read scope and never launches a paid execution", async () => {
    mocks.launch.mockResolvedValue({ estimatedCostCents: 0.12 });
    const response = await aiTrackingRoute(
      context("POST", ["runs", "preview"], { prompt_ids: ["aip_public"] }, {}, ["read"]),
    );
    expect(response?.status).toBe(200);
    expect(mocks.launch).toHaveBeenCalledWith(
      "internal_project",
      { promptIds: ["aip_public"] },
      true,
    );
    expect(mocks.scope).toHaveBeenCalledWith({ id: "trusted_actor" }, "prj_public", false);
  });
  it("injects trusted actor and credential instead of client provenance", async () => {
    mocks.launch.mockResolvedValue({ publicId: "air_public", state: "planned" });
    const response = await aiTrackingRoute(
      context(
        "POST",
        ["runs"],
        {
          actor_id: "attacker",
          actor_credential: { id: "attacker", kind: "project_key" },
          entry_source: "app",
          origin: "scheduled",
        },
        { "Idempotency-Key": "bound-key" },
      ),
    );
    expect(response?.status).toBe(201);
    expect(mocks.launch.mock.calls[0][1]).toMatchObject({
      actorId: "trusted_actor",
      actorCredential: { id: "trusted_key", kind: "project_key" },
      entrySource: "mcp",
      origin: "manual",
      idempotencyKey: "bound-key",
    });
  });
  it("requires idempotency and write scope before launch", async () => {
    expect((await aiTrackingRoute(context("POST", ["runs"])))?.status).toBe(400);
    expect(
      (await aiTrackingRoute(context("POST", ["runs"], {}, { "Idempotency-Key": "key" }, ["read"])))
        ?.status,
    ).toBe(403);
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it("returns 409 for payload reuse and 422 for invalid provider configuration", async () => {
    mocks.launch.mockRejectedValueOnce(
      new Error("Idempotency key is bound to a different tracking payload."),
    );
    expect(
      (await aiTrackingRoute(context("POST", ["runs"], {}, { "Idempotency-Key": "key" })))?.status,
    ).toBe(409);
    mocks.launch.mockRejectedValueOnce(
      new Error("Tracking source and engine combination is unsupported."),
    );
    expect((await aiTrackingRoute(context("POST", ["runs", "preview"])))?.status).toBe(422);
  });
  it("exports all bounded pages with public identities and CSV continuation metadata", async () => {
    const sample = {
      publicId: "asm_public",
      promptRevision: { publicId: "apr_public", text: "=formula" },
      plan: {},
      measurement: "unknown",
      source: "model_api",
      engine: "chat_gpt",
      evidence: null,
      receipt: null,
    };
    mocks.samples
      .mockResolvedValueOnce({ items: [sample], nextCursor: "second" })
      .mockResolvedValueOnce({ items: [{ ...sample, publicId: "asm_second" }], nextCursor: null });
    const jsonCtx = context("GET", ["export"]);
    jsonCtx.url.search = "?run_id=air_public&limit=100";
    const json = await (await aiTrackingRoute(jsonCtx))?.json();
    expect(json.data.scope).toMatchObject({ complete: true, loaded: 2, resumed: false });
    expect(json.data.items.map((item: { id: string }) => item.id)).toEqual([
      "asm_public",
      "asm_second",
    ]);
    expect(mocks.samples.mock.calls).toEqual([
      ["internal_project", "air_public", { limit: 100, cursor: undefined }],
      ["internal_project", "air_public", { limit: 100, cursor: "second" }],
    ]);
    mocks.samples.mockImplementation(async (_project, _run, page) => ({
      items: [{ ...sample, publicId: `asm_page_${page.cursor ?? "first"}` }],
      nextCursor: String(Number(page.cursor ?? 0) + 1),
    }));
    const csvCtx = context("GET", ["export"]);
    csvCtx.url.search = "?run_id=air_public&limit=100&format=csv";
    const csv = await aiTrackingRoute(csvCtx);
    expect(csv?.headers.get("X-Export-Complete")).toBe("false");
    expect(csv?.headers.get("X-Next-Cursor")).toBe("10");
    const bytes = await csv?.text();
    expect(bytes).toContain("export_complete,next_cursor,resumed_segment");
    expect(bytes).toContain("false,10,false");
    expect(bytes).toContain("'=formula");
  });
});
