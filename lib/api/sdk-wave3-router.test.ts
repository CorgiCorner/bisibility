import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  scope: vi.fn(),
  launch: vi.fn(),
  run: vi.fn(),
  samples: vi.fn(),
  auditRun: vi.fn(),
  auditScope: vi.fn(),
  auditList: vi.fn(),
  auditRead: vi.fn(),
  audit: vi.fn(),
  connections: vi.fn(),
  provider: vi.fn(),
  query: vi.fn(),
  reauth: vi.fn(),
}));
vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_ctx, execute) => execute()) }));
vi.mock("./ai-tracking-service", () => ({
  trackingScope: mocks.scope,
  trackingLaunch: mocks.launch,
  trackingRun: mocks.run,
  trackingSamples: mocks.samples,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit, writeAuditFailure: vi.fn() }));
vi.mock("@/lib/actions/_shared", () => ({ requireProjectScope: mocks.auditScope }));
vi.mock("@/lib/site-audit/service", () => ({
  runSiteAudit: mocks.auditRun,
  listSiteAudits: mocks.auditList,
  readSiteAudit: mocks.auditRead,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findMany: mocks.connections } },
}));
vi.mock("@/lib/providers/registry", () => ({ getAnalyticsProvider: mocks.provider }));
vi.mock("@/lib/traffic/runtime-credentials", () => ({ trafficRuntimeCredentials: () => ({}) }));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: mocks.reauth }));

import { ProviderAuthError } from "@/lib/providers/auth-error";
import { siteAuditResultSchema } from "@/lib/site-audit/schema";
import { handleApiRequest } from "./router";

const projectId = "prj_a00000000000000000000000";
const runId = "air_a00000000000000000000000";
const connectionId = "conn_a00000000000000000000000";
const reportId = "agr_a00000000000000000000000";
const now = new Date("2026-10-18T00:00:00.000Z");
const configuration = {
  provider: "dataforseo",
  endpoint: "ai_optimization/llm_responses/live",
  engine: "chat_gpt",
  source: "model_api",
  model: "example-model",
  parameters: {},
};
const run = {
  id: "run-db",
  publicId: runId,
  state: "planned",
  createdAt: now,
  updatedAt: now,
  finishedAt: null,
  plannedAt: null,
  samples: [],
};
const result = siteAuditResultSchema.parse({
  version: 1,
  target: "https://example.com/",
  startedAt: now.toISOString(),
  completedAt: now.toISOString(),
  state: "partial",
  stopReason: "page_limit",
  limits: { maxPages: 1, maxRequests: 20, maxDurationMs: 15000, maxPageBytes: 524288 },
  requests: 1,
  pages: [
    {
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      status: 200,
      responseTimeMs: 12,
      title: "Example",
      description: null,
      canonical: null,
      headings: [{ level: 1, text: "Example" }],
      h1Count: 1,
      indexable: true,
      robots: null,
      internalLinkCount: 1,
      externalLinkCount: 0,
      internalLinks: ["https://example.com/about"],
      imageCount: 1,
      missingAltCount: 1,
      issues: [{ code: "missing_alt", severity: "warning", message: "Image needs alt text." }],
    },
  ],
  summary: { pages: 1, errors: 0, warnings: 1, indexable: 1 },
  limitations: ["Bounded crawl."],
});
const saved = { id: reportId, createdAt: now.toISOString(), cached: false, result };

async function call(method: string, suffix: string, body?: unknown, key?: string) {
  const url = new URL(`https://example.com/api/v1/projects/${projectId}/${suffix}`);
  return handleApiRequest(
    new Request(url, {
      method,
      headers: {
        authorization: "Bearer bsb_key_live_test",
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    url.pathname.slice("/api/v1/".length).split("/"),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  const project = {
    id: "project-db",
    publicId: projectId,
    name: "Example",
    domain: "example.com",
    ownerId: "owner",
    writeMode: "writable",
    createdAt: now,
    updatedAt: now,
  };
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: { id: "key-db", projectId: project.id, scopes: ["read", "write", "admin"] },
    project,
  });
  mocks.scope.mockResolvedValue(project);
  mocks.auditScope.mockResolvedValue(project);
  mocks.run.mockResolvedValue(run);
  mocks.samples.mockResolvedValue({ items: [], nextCursor: null });
  mocks.auditRun.mockResolvedValue(saved);
  mocks.auditRead.mockResolvedValue({ ...saved, cached: true });
  mocks.auditList.mockResolvedValue([
    {
      id: reportId,
      kind: "site_audit",
      title: "Site audit: example.com",
      createdAt: now.toISOString(),
    },
  ]);
  mocks.connections.mockResolvedValue([
    { id: "connection-db", publicId: connectionId, provider: "gsc" },
  ]);
  mocks.provider.mockReturnValue({
    id: "gsc",
    label: "Google Search Console",
    fetchQueryStats: mocks.query,
  });
  mocks.query.mockResolvedValue([
    { query: "example", clicks: 1, impressions: 10, ctr: 0.1, position: 2.5 },
  ]);
});

describe("SDK wave 3 operations through the real router", () => {
  it("previews revisions and creates a paid run only with the required header", async () => {
    mocks.launch.mockResolvedValueOnce({
      configurations: [configuration],
      credentialConnectionId: connectionId,
      credentialVersion: "v1",
      budgetRevision: "b1",
      consentRevision: "c1",
      estimatedCostCents: 1.25,
    });
    const preview = await call("POST", "ai-tracking/runs/preview", {
      prompt_ids: ["aip_a00000000000000000000000"],
      configurations: [configuration],
    });
    expect(preview.status).toBe(200);
    expect((await preview.json()).data).toMatchObject({
      consent_revision: "c1",
      estimated_cost_cents: 1.25,
    });
    const body = {
      prompt_ids: ["aip_a00000000000000000000000"],
      configurations: [configuration],
      credential_connection_id: connectionId,
      credential_version: "v1",
      budget_revision: "b1",
      consent_revision: "c1",
      deadline: now.toISOString(),
      consent: true,
    };
    expect((await call("POST", "ai-tracking/runs", body)).status).toBe(400);
    mocks.launch.mockResolvedValueOnce(run);
    const created = await call("POST", "ai-tracking/runs", body, "launch-one");
    expect(created.status).toBe(201);
    expect((await created.json()).data).toMatchObject({
      id: runId,
      state: "planned",
      sample_count: 0,
    });
    expect(mocks.launch).toHaveBeenLastCalledWith(
      "project-db",
      expect.objectContaining({
        idempotencyKey: "launch-one",
        consent: true,
        credentialVersion: "v1",
        budgetRevision: "b1",
        consentRevision: "c1",
      }),
      false,
    );
  });

  it("reads a run and samples with null and retained JSON evidence", async () => {
    expect((await call("GET", `ai-tracking/runs/${runId}`)).status).toBe(200);
    const sample = {
      id: "sample-db",
      publicId: "asm_a00000000000000000000000",
      measurement: "answer_present",
      source: "model_api",
      engine: "chat_gpt",
      promptRevision: { publicId: "apr_a00000000000000000000000", text: "Example?" },
      plan: {},
      evidence: null,
      receipt: null,
    };
    mocks.samples.mockResolvedValue({ items: [sample], nextCursor: "next-page" });
    const first = await call("GET", `ai-tracking/runs/${runId}/samples?limit=1`);
    expect(first.status).toBe(200);
    expect((await first.json()).data[0]).toMatchObject({ cost_usd: null, evidence: null });
    mocks.samples.mockResolvedValue({
      items: [
        {
          ...sample,
          answerText: "Example",
          raw: { values: [1, true, null, { text: "Example" }] },
          citations: [{ url: "https://example.com/", title: null, position: 0 }],
          receipt: { amountUsd: "0.0125", state: "confirmed" },
          evidence: {
            answerTruncated: false,
            rawTruncated: false,
            searchResults: [],
            requestedLocale: "en",
            effectiveLocale: null,
            localeMechanism: null,
            requestedModel: "example-model",
            actualModel: null,
            providerStatus: null,
            observedAt: now.toISOString(),
            fetchedAt: now.toISOString(),
            recordedSource: "fresh",
          },
        },
      ],
      nextCursor: null,
    });
    const second = await call("GET", `ai-tracking/runs/${runId}/samples?limit=1&cursor=next-page`);
    expect(second.status).toBe(200);
    expect((await second.json()).data[0]).toMatchObject({
      cost_usd: "0.0125",
      evidence: { raw: { values: [1, true, null, { text: "Example" }] } },
    });
    expect(mocks.samples).toHaveBeenLastCalledWith("project-db", runId, {
      limit: "1",
      cursor: "next-page",
    });
  });

  it("runs, lists and reads the complete bounded audit result", async () => {
    const launched = await call("POST", "site-audits", { max_pages: 1 });
    expect(launched.status).toBe(200);
    expect((await launched.json()).data.result.pages[0]).toMatchObject({
      final_url: "https://example.com/",
      missing_alt_count: 1,
    });
    expect(mocks.auditRun).toHaveBeenCalledWith(expect.anything(), { maxPages: 1 });
    expect((await call("GET", "site-audits")).status).toBe(200);
    expect((await call("GET", `site-audits/${reportId}`)).status).toBe(200);
    expect((await call("POST", "site-audits", { max_pages: 16 })).status).toBe(400);
  });

  it("captures search-performance scope and the declared connection/auth problems", async () => {
    const query =
      "analytics/query-stats?start_date=2026-10-01&end_date=2026-10-18&limit=10&query=example&clicks_min=1&impressions_min=2&position_max=5&query_match=contains&page_path_match=prefix";
    const response = await call("GET", query);
    expect(response.status).toBe(200);
    expect((await response.json()).scope).toMatchObject({
      start_date: "2026-10-01",
      query_match: "contains",
    });
    mocks.query.mockResolvedValueOnce([
      {
        query: "example",
        page: "https://example.com/about",
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 2.5,
      },
    ]);
    expect(
      (await call("GET", `${query}&page_path=/about&connection_id=${connectionId}`)).status,
    ).toBe(200);
    mocks.query.mockRejectedValueOnce(new ProviderAuthError("gsc"));
    const expired = await call("GET", query);
    expect(expired.status).toBe(422);
    expect(expired.headers.get("content-type")).toContain("application/problem+json");
    expect(mocks.reauth).toHaveBeenCalledOnce();
    mocks.connections.mockResolvedValueOnce([]);
    const disconnected = await call("GET", query);
    expect(disconnected.status).toBe(404);
    expect(disconnected.headers.get("content-type")).toContain("application/problem+json");
  });
});
