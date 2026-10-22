import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  scope: vi.fn(),
  create: vi.fn(),
  profile: vi.fn(),
  ranked: vi.fn(),
  metrics: vi.fn(),
  locations: vi.fn(),
  allocations: vi.fn(),
  sync: vi.fn(),
  catalog: vi.fn(),
  prisma: {
    project: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    competitor: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    alertRule: { findMany: vi.fn(), updateMany: vi.fn() },
    notificationPreference: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
    slackConnection: { findUnique: vi.fn() },
    webhookEndpoint: { count: vi.fn() },
    membership: { findMany: vi.fn() },
    providerConnection: { findMany: vi.fn() },
    backlinkSnapshot: { findFirst: vi.fn(), findMany: vi.fn() },
    domainOverviewSnapshot: { findUnique: vi.fn(), findMany: vi.fn() },
    keywordResearchSnapshot: { findUnique: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
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
vi.mock("@/lib/db/prisma", () => ({
  prisma: { ...mocks.prisma, $transaction: vi.fn((execute) => execute(mocks.prisma)) },
}));
vi.mock("@/lib/actions/_shared", () => ({
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
  requireProjectScope: mocks.scope,
  revalidateCompetitorViews: vi.fn(),
  revalidateAlertViews: vi.fn(),
  revalidateSettingsViews: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(),
  requiredPublicAuditId: (value: string) => value,
}));
vi.mock("./project-service", () => ({ createProjectRecord: mocks.create }));
vi.mock("@/lib/account/profile-service", () => ({ updateProfileNameRecord: mocks.profile }));
vi.mock("@/lib/providers/own-key-policy-extension", () => ({
  ownProviderKeysRequired: async () => false,
}));
vi.mock("@/lib/ranked-keywords/service", () => ({ fetchRankedKeywords: mocks.ranked }));
vi.mock("@/lib/keyword-research/service", () => ({ fetchKeywordMetrics: mocks.metrics }));
vi.mock("./locations-search", () => ({ searchLocations: mocks.locations }));
vi.mock("@/lib/provider-allocations/repository", () => ({
  readProjectProviderAllocations: mocks.allocations,
}));
vi.mock("@/lib/traffic/sync-now", () => ({ syncProjectTrafficNow: mocks.sync }));
vi.mock("@/lib/ai-research/catalog-service", () => ({ getAiResearchCatalog: mocks.catalog }));
vi.mock("@/lib/keyword-research/context", () => ({
  keywordResearchProject: async () => ({ id: "project-db" }),
  researchLocation: async () => ({ key: "US@en", value: { gl: "US", hl: "en" } }),
}));
vi.mock("@/lib/providers/crypto", () => ({ encryptSecret: () => "test-snapshot-reference" }));

import { handleApiRequest } from "./router";

const projectId = "prj_a00000000000000000000000";
const competitorId = "cmp_a00000000000000000000000";
const connectionId = "conn_a00000000000000000000000";
const now = new Date("2026-10-20T00:00:00.000Z");
const project = {
  id: "project-db",
  publicId: projectId,
  name: "Example",
  domain: "example.com",
  ownerId: "owner",
  writeMode: "active",
  trackingScope: "country",
  isSample: false,
  createdAt: now,
  updatedAt: now,
};
const connection = {
  id: "connection-db",
  publicId: connectionId,
  provider: "dataforseo",
  credentialSource: "own",
  enabled: true,
  status: "connected",
  priority: 0,
};
const preference = {
  alertEmail: true,
  alertInApp: true,
  alertPush: true,
  checkEmail: false,
  checkInApp: false,
  importEmail: true,
  importInApp: true,
  inviteEmail: true,
  inviteInApp: true,
  reportEmail: true,
};
const researchRow = {
  keyword: "example",
  source: "related",
  searchVolume: 100,
  cpcCents: 125,
  competition: 0.2,
  difficulty: 23.5,
  intent: null,
  monthlyTrend: [{ year: 2026, month: 9, searchVolume: null }],
};
const backlinkSnapshot = {
  id: "snapshot-db",
  projectId: project.id,
  target: "example.com",
  targetScope: "site",
  includeSubdomains: true,
  fetchedAt: now,
  expiresAt: new Date("2026-10-21T00:00:00Z"),
  fetchedRowCount: 1,
  totalRowsAvailable: 1,
  summary: { _provider: "dataforseo", _mode: "as_is", backlinksTotal: 1, referringDomainsTotal: 1 },
  history: [{ month: "2026-09", newLinks: 1, lostLinks: 0 }],
  rows: [
    {
      id: "row-db",
      anchor: null,
      domainAuthority: null,
      firstSeen: null,
      flags: [],
      linksCount: 1,
      lostAt: null,
      sourceDomain: "example.com",
      sourceUrl: "https://example.com/source",
      spamScore: null,
      status: "active",
      targetUrl: "https://example.com/",
    },
  ],
};
const overviewSnapshot = {
  fetchedAt: now,
  languageCode: "en",
  locationCode: 2840,
  scope: "root",
  target: "example.com",
  provider: "dataforseo",
  overview: null,
  rankedKeywords: null,
  relevantPages: null,
  history: null,
  previousFetchedAt: null,
  previousOverview: null,
  previousSourceSnapshotAt: null,
  sourceSnapshotAt: null,
};
const researchSnapshot = {
  countryCode: "US",
  languageCode: "en",
  seed: "example",
  mode: "auto",
  includeClickstream: false,
  resultLimit: 100,
  provider: "dataforseo",
  requestKey: "request-key",
  rows: [researchRow],
  sources: [{ cached: true, costCents: 0, returned: 1, source: "related", status: "ok" }],
  fetchedAt: now,
  updatedAt: now,
  freshUntil: new Date("2026-11-19T00:00:00Z"),
  project: { keywords: [], savedKeywords: [] },
};

async function call(method: string, path: string, body?: unknown) {
  const url = new URL(`https://example.com/api/v1/${path}`);
  return handleApiRequest(
    new Request(url, {
      method,
      headers: {
        authorization: "Bearer bsb_pat_live_test",
        "Content-Type": "application/json",
        ...(method === "GET" ? {} : { "Idempotency-Key": "wave4-test" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    url.pathname.slice("/api/v1/".length).split("/"),
  );
}
function personalAuth() {
  mocks.auth.mockResolvedValue({
    kind: "personal_token",
    user: {
      id: "owner",
      publicId: "usr_a00000000000000000000000",
      email: "owner@example.com",
      name: "Example",
    },
    token: { id: "token-db", scopes: ["read", "write", "admin"] },
    memberships: [{ projectId: project.id, role: "owner" }],
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: { id: "key-db", scopes: ["read", "write", "admin"], projectId: project.id },
    project,
  });
  mocks.scope.mockResolvedValue(project);
  mocks.prisma.project.findUnique.mockResolvedValue({
    ...project,
    providerConnections: [connection],
  });
  mocks.prisma.project.findFirst.mockResolvedValue(project);
  mocks.prisma.project.update.mockResolvedValue({ ...project, name: "Updated" });
  mocks.create.mockResolvedValue(project);
  mocks.profile.mockResolvedValue({ name: "Updated" });
  mocks.prisma.competitor.findUnique.mockResolvedValue(null);
  const competitor = {
    id: "competitor-db",
    publicId: competitorId,
    domain: "example.com",
    label: null,
  };
  mocks.prisma.competitor.findFirst.mockResolvedValue(competitor);
  mocks.prisma.competitor.create.mockResolvedValue(competitor);
  mocks.prisma.alertRule.findMany.mockResolvedValue([]);
  mocks.prisma.notificationPreference.findUnique.mockResolvedValue(preference);
  mocks.prisma.notificationPreference.upsert.mockResolvedValue({ ...preference, alertPush: false });
  mocks.prisma.user.findUnique.mockResolvedValue({
    email: "owner@example.com",
    emailVerified: true,
  });
  mocks.prisma.slackConnection.findUnique.mockResolvedValue(null);
  mocks.prisma.webhookEndpoint.count.mockResolvedValue(0);
  mocks.prisma.membership.findMany.mockResolvedValue([
    { project: { ...project, providerConnections: [] }, role: "owner" },
  ]);
  mocks.prisma.providerConnection.findMany.mockResolvedValue([connection]);
  mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(backlinkSnapshot);
  mocks.prisma.backlinkSnapshot.findMany.mockResolvedValue([backlinkSnapshot]);
  mocks.prisma.domainOverviewSnapshot.findUnique.mockResolvedValue(overviewSnapshot);
  mocks.prisma.domainOverviewSnapshot.findMany.mockResolvedValue([overviewSnapshot]);
  mocks.prisma.keywordResearchSnapshot.findUnique.mockResolvedValue(researchSnapshot);
  mocks.prisma.keywordResearchSnapshot.findMany.mockResolvedValue([researchSnapshot]);
  mocks.allocations.mockResolvedValue([
    {
      internalConnectionId: connection.id,
      source: "connection",
      allocation: { unit: "cents", amountPerMonth: 1000 },
      programmaticAllocation: null,
      credits: { app: null, programmatic: { unit: "cents", amountPerMonth: 100 } },
    },
  ]);
  mocks.locations.mockResolvedValue({
    candidates: [
      {
        kind: "city",
        display_name: "Example City",
        country_code: "US",
        region_code: null,
        region_name: null,
        city_name: "Example City",
        canonical_key: "US/Example City@en",
        hl: "en",
        language_code: "en",
        language_label: "English",
      },
    ],
  });
  mocks.ranked.mockResolvedValue({
    ok: true,
    cached: false,
    connections: [{ id: connectionId, label: "Example", provider: "dataforseo" }],
    costCents: 1.25,
    fetchedAt: now.toISOString(),
    offset: 0,
    totalCount: 1,
    rows: [
      {
        keyword: "example",
        alreadyTracked: false,
        position: 2,
        searchVolume: null,
        estimatedTraffic: null,
      },
    ],
  });
  mocks.metrics.mockResolvedValue({
    ok: true,
    cachedCount: 0,
    fetchedCount: 1,
    connections: [{ id: connectionId, label: "Example", provider: "dataforseo" }],
    costCents: 1.25,
    fetchedAt: now.toISOString(),
    provider: "dataforseo",
    rows: [researchRow],
  });
  mocks.sync.mockResolvedValue({
    connections: 1,
    keywordSnapshots: 1,
    pageSnapshots: 0,
    skipped: [{ provider: "example", reason: "no_capability" }],
    runs: [
      {
        connectionId: connection.id,
        provider: "dataforseo",
        status: "succeeded_with_data",
        rowsFetched: 1,
        rowsMatched: 1,
        rowsUpserted: 1,
        truncated: false,
      },
    ],
  });
});

describe("SDK wave 4 core operations through the real router", () => {
  it("adds and removes a competitor using the domain service serializers", async () => {
    const added = await call("POST", `projects/${projectId}/competitors`, {
      domain: "example.com",
    });
    expect(added.status).toBe(201);
    expect(await added.json()).toEqual({ id: competitorId, domain: "example.com", label: null });
    const removed = await call("DELETE", `projects/${projectId}/competitors/${competitorId}`);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ removed: true });
  });
  it("searches locations without a cursor and reads offset-ranked suggestions", async () => {
    expect((await call("GET", "locations/search?q=Example")).status).toBe(200);
    expect(
      (await call("GET", `projects/${projectId}/ranked-keyword-suggestions?max_cost_cents=10`))
        .status,
    ).toBe(200);
  });
  it("gets keyword metrics with fractional cost and nullable metrics", async () => {
    const response = await call("POST", `projects/${projectId}/keyword-metrics`, {
      keywords: ["example"],
      max_cost_cents: 10,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      cost_cents: 1.25,
      rows: [{ intent: null, difficulty: 23.5 }],
    });
  });
  it("estimates keyword metrics without returning paid rows", async () => {
    mocks.metrics.mockResolvedValue({
      ok: true,
      cachedCount: 0,
      fetchedCount: 0,
      connections: [],
      costCents: 0,
      fetchedAt: now.toISOString(),
      provider: "dataforseo",
      rows: [],
      estimate: true,
      estimatedCostCents: 1.25,
      fetchedCountEstimate: 1,
    });
    const response = await call("POST", `projects/${projectId}/keyword-metrics`, {
      keywords: ["example"],
      estimate_only: true,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      estimate: true,
      estimated_cost_cents: 1.25,
      rows: [],
    });
  });
  it("reads full preferences and applies a partial patch with the real preference service", async () => {
    const read = await call("GET", `projects/${projectId}/notification-preferences`);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ email_verification: "verified", report_email: true });
    const updated = await call("PATCH", `projects/${projectId}/notification-preferences`, {
      alert_push: false,
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      alert_push: false,
      report_email: true,
      project_id: projectId,
    });
  });
  it("creates and updates a project and updates the account profile", async () => {
    personalAuth();
    expect(
      (
        await call("POST", "projects", {
          name: "Example",
          domain: "example.com",
          defaults: { frequency: "manual", serp_depth: 10 },
        })
      ).status,
    ).toBe(201);
    expect((await call("PATCH", `projects/${projectId}`, { name: "Updated" })).status).toBe(200);
    const updated = await call("PATCH", "me", { name: "Updated" });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ name: "Updated", projects: [{ id: projectId }] });
  });
  it("lists reports and reads every stored kind from database records", async () => {
    expect((await call("GET", `projects/${projectId}/research/reports`)).status).toBe(200);
    for (const path of [
      "backlinks?target=example.com",
      "domain_overview?target=example.com&location_code=2840&language_code=en",
      "keyword_research?seed=example",
    ]) {
      const response = await call("GET", `projects/${projectId}/research/reports/${path}`);
      expect(response.status).toBe(200);
      expect((await response.json()).data).toHaveProperty("state", "fresh");
    }
  });
  it("reads the free AI research catalog the provider reports", async () => {
    mocks.catalog.mockResolvedValue({
      ok: true,
      catalog: {
        models: [
          {
            id: "gpt-example",
            provider: "chat_gpt",
            label: "Example model",
            reasoning: false,
            webSearch: true,
            minOutputTokens: 16,
            maxOutputTokens: 4096,
            priceAvailable: true,
            admissionEnabled: true,
            actualCostEnabled: false,
          },
        ],
        visibilityMarkets: [
          {
            platform: "chat_gpt",
            locationCode: 2840,
            countryName: "United States",
            languages: [{ code: "en", name: "English" }],
          },
        ],
        responseCountries: [{ code: "US", name: "United States" }],
        responseLanguages: [{ code: "en", name: "English" }],
        limits: { maxModels: 2, maxOutputTokens: 4096 },
        fetchedAt: now.toISOString(),
        actualCostAvailable: false,
      },
    });
    const response = await call("GET", `projects/${projectId}/ai-catalog`);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      models: [{ id: "gpt-example", web_search: true, max_output_tokens: 4096 }],
      limits: { max_models: 2, max_output_tokens: 4096 },
      actual_cost_available: false,
    });
  });
  it("lists provider budgets and synchronizes traffic with public connection IDs", async () => {
    const budgets = await call("GET", `projects/${projectId}/provider-budgets`);
    expect(budgets.status).toBe(200);
    expect((await budgets.json()).meta).toEqual({ next_cursor: null });
    const sync = await call("POST", `projects/${projectId}/analytics/sync`);
    expect(sync.status).toBe(200);
    expect((await sync.json()).runs[0]).toMatchObject({ connection_id: connectionId });
  });
});
