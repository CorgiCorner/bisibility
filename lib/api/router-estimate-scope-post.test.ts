import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  assertMaxCost: vi.fn(),
  auth: vi.fn(),
  domainEstimate: vi.fn(),
  fetchDomainHistory: vi.fn(),
  fetchDomainKeywords: vi.fn(),
  fetchDomainPages: vi.fn(),
  findSnapshotMetadata: vi.fn(),
  loadDomainModule: vi.fn(),
  persistDomainHistory: vi.fn(),
  persistDomainModules: vi.fn(),
  preflight: vi.fn(),
  readDomainCache: vi.fn(),
  requireDomainSource: vi.fn(),
  resolveSnapshot: vi.fn(),
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  LEGACY_BEARER_PREFIXES: ["bsk_", "bsp_"],
  PERSONAL_TOKEN_PREFIX: "bsb_pat_live_",
  PROJECT_API_KEY_PREFIX: "bsb_key_",
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_input, execute) => execute()) }));
vi.mock("@/lib/domain-overview/context", () => ({
  requireDomainOverviewSource: mocks.requireDomainSource,
}));
vi.mock("@/lib/domain-overview/provider-call", () => ({
  assertDomainOverviewMaxCost: mocks.assertMaxCost,
  domainOverviewCostReservation: (maxCostCents?: number) => {
    let reserved = 0;
    return (costCents: number) => {
      mocks.assertMaxCost(reserved + costCents, maxCostCents);
      reserved += costCents;
    };
  },
  domainOverviewEstimate: mocks.domainEstimate,
  fetchDomainHistory: mocks.fetchDomainHistory,
  fetchDomainKeywords: mocks.fetchDomainKeywords,
  fetchDomainPages: mocks.fetchDomainPages,
  preflightDomainOverview: mocks.preflight,
}));
vi.mock("@/lib/domain-overview/snapshot", () => ({
  findDomainOverviewSnapshot: vi.fn(),
  findDomainOverviewSnapshotMetadata: mocks.findSnapshotMetadata,
  persistDomainOverviewHistory: mocks.persistDomainHistory,
  persistDomainOverviewModules: mocks.persistDomainModules,
  resolveDomainOverviewSnapshot: mocks.resolveSnapshot,
}));
vi.mock("@/lib/domain-overview/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domain-overview/cache")>()),
  loadDomainOverviewModule: mocks.loadDomainModule,
  readDomainOverviewCache: mocks.readDomainCache,
}));

const projectPublicId = "prj_a00000000000000000000000";
const project = {
  budgetCapCents: 500,
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "owner_1",
  providerConnections: [],
  publicId: projectPublicId,
  writeMode: "writable",
};
const domainSource = {
  connection: { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
  provider: {
    fetchDomainRankOverview: vi.fn(),
    fetchHistoricalRankOverview: vi.fn(),
    fetchRankedKeywords: vi.fn(),
    fetchRelevantPages: vi.fn(),
    id: "dataforseo",
    label: "DataForSEO",
  },
};
const estimateBody = {
  estimate_only: true,
  language_code: "en",
  location_code: 2840,
  target: "example.com",
};

function authenticate(scopes: string[]) {
  mocks.auth.mockResolvedValue({
    apiKey: { id: "key_1", projectId: project.id, scopes },
    kind: "project_key",
    project,
  });
}

async function route(body: unknown) {
  const path = `/projects/${projectPublicId}/domain-overview/analyze`;
  const request = new Request(`https://example.test/api/v1${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer bsb_key_live_test_key",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  return handleApiRequest(request, path.split("/").slice(1));
}

describe("estimate-only scope for the domain overview estimate operation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate(["read"]);
    mocks.requireDomainSource.mockResolvedValue({ project, source: domainSource });
    mocks.domainEstimate.mockReturnValue({
      core: 6,
      history: 10,
      keywords: 2,
      overview: 1,
      pages: 3,
    });
    mocks.findSnapshotMetadata.mockResolvedValue(null);
    mocks.readDomainCache.mockResolvedValue(null);
    mocks.preflight.mockResolvedValue(undefined);
    mocks.resolveSnapshot.mockImplementation(
      async ({ beforeLoad }: { beforeLoad?: () => void }) => {
        beforeLoad?.();
        return { cached: false, costCents: 1, data: { count: 1, etv: 1 } };
      },
    );
    mocks.fetchDomainKeywords.mockResolvedValue({ costCents: 2, rows: [], totalCount: 0 });
    mocks.fetchDomainPages.mockResolvedValue({ costCents: 3, rows: [], totalCount: 0 });
    mocks.fetchDomainHistory.mockResolvedValue({ costCents: 10, rows: [] });
    mocks.persistDomainModules.mockResolvedValue({ count: 1 });
    mocks.persistDomainHistory.mockResolvedValue({ id: "snapshot_1" });
    mocks.loadDomainModule.mockImplementation(
      async ({ load }: { load: () => Promise<unknown> }) => {
        const value = (await load()) as { costCents: number };
        return {
          cached: false,
          costCents: value.costCents,
          fetchedAt: "2026-09-17T12:00:00.000Z",
          ok: true,
        };
      },
    );
  });

  it("runs the estimate path with a read-scope key without spending budget", async () => {
    const response = await route(estimateBody);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { estimate: true, estimated_cost_cents: 6 },
    });
    expect(mocks.assertMaxCost).not.toHaveBeenCalled();
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.resolveSnapshot).not.toHaveBeenCalled();
    expect(mocks.fetchDomainKeywords).not.toHaveBeenCalled();
    expect(mocks.fetchDomainPages).not.toHaveBeenCalled();
  });

  it.each([
    ["paid body", { ...estimateBody, estimate_only: false, max_cost_cents: 100 }],
    ["string flag", { ...estimateBody, estimate_only: "true" }],
  ])("rejects a read-scope key for the %s", async (_case, body) => {
    expect((await route(body)).status).toBe(403);
    expect(mocks.assertMaxCost).not.toHaveBeenCalled();
    expect(mocks.resolveSnapshot).not.toHaveBeenCalled();
  });

  it("keeps write-scope keys working in estimate and paid mode", async () => {
    authenticate(["write"]);

    expect((await route(estimateBody)).status).toBe(200);
    expect(
      (await route({ ...estimateBody, estimate_only: false, max_cost_cents: 100 })).status,
    ).toBe(200);
    expect(mocks.preflight).toHaveBeenCalled();
  });
});
