import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  backlinksCache: vi.fn(),
  getProvider: vi.fn(),
  keywordCache: vi.fn(),
  keywordCacheWrap: vi.fn(),
  keywordProject: vi.fn(),
  paidCall: vi.fn(),
  personalScope: vi.fn(),
  preflightBudget: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    backlinkSnapshot: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  rateContext: vi.fn(),
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  LEGACY_BEARER_PREFIXES: ["bsk_", "bsp_"],
  PERSONAL_TOKEN_PREFIX: "bsb_pat_live_",
  PROJECT_API_KEY_PREFIX: "bsb_key_",
  authenticateBearer: mocks.auth,
}));
vi.mock("./personal-scope", () => ({ resolvePersonalProjectScope: mocks.personalScope }));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_input, execute) => execute()) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.getProvider }));
vi.mock("@/lib/provider-lookups/paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-lookups/paid-call")>()),
  paidProviderCall: mocks.paidCall,
  preflightProviderBudget: mocks.preflightBudget,
}));
vi.mock("@/lib/backlinks/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/backlinks/cache")>()),
  withBacklinksCache: mocks.backlinksCache,
}));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContext: mocks.rateContext,
}));
vi.mock("@/lib/keyword-research/context", () => ({
  connectionResources: () => [
    { id: "conn_a00000000000000000000000", label: "DataForSEO", provider: "dataforseo" },
  ],
  eligibleResearchConnections: (project: { eligible: unknown[] }) => project.eligible,
  keywordResearchProject: mocks.keywordProject,
  researchLocation: () => Promise.resolve({ key: "US", value: { gl: "us", hl: "en" } }),
}));
vi.mock("@/lib/keyword-research/cache", () => ({
  keywordResearchCachedUntil: (fetchedAt: string) => fetchedAt,
  keywordResearchCacheKey: (input: { source: string }) => `kr:${input.source}`,
  readKeywordResearchCache: mocks.keywordCache,
  withKeywordResearchCache: mocks.keywordCacheWrap,
}));
vi.mock("@/lib/keyword-research/metrics", () => ({ fetchKeywordMetrics: vi.fn() }));
vi.mock("@/lib/keyword-research/snapshot", () => ({
  maybePersistKeywordResearchSnapshot: vi.fn(),
}));

const projectPublicId = "prj_a00000000000000000000000";
const project = {
  budgetCapCents: 5_000,
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "owner_1",
  providerConnections: [
    { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
  ],
  publicId: projectPublicId,
  writeMode: "writable",
};
const backlinksProvider = {
  fetchBacklinksHistory: vi.fn(),
  fetchBacklinksRows: vi.fn(),
  fetchBacklinksSummary: vi.fn(),
  id: "dataforseo",
  label: "DataForSEO",
};
const researchProvider = {
  fetchKeywordIdeas: vi.fn(),
  fetchKeywordSuggestions: vi.fn(),
  fetchRelatedKeywords: vi.fn(),
  id: "dataforseo",
  label: "DataForSEO",
};
const researchProject = {
  eligible: [
    {
      connection: {
        credentialsEncrypted: "secret",
        id: "connection_1",
        provider: "dataforseo",
        publicId: "conn_a00000000000000000000000",
      },
      provider: researchProvider,
    },
  ],
  id: "project_1",
  keywords: [],
  publicId: projectPublicId,
  savedKeywords: [],
};

function authenticate(scopes: string[]) {
  mocks.auth.mockResolvedValue({
    apiKey: { id: "key_1", projectId: project.id, scopes },
    kind: "project_key",
    project,
  });
}

function authenticatePersonalToken(scopes: string[]) {
  mocks.auth.mockResolvedValue({
    kind: "personal_token",
    memberships: [],
    token: { id: "pat_1", prefix: "bsb_pat_live_", scopes, userId: "user_1" },
    user: { email: "owner@example.com", id: "user_1", name: "Owner" },
  });
  mocks.personalScope.mockResolvedValue({
    auth: { apiKey: { id: "pat_1", projectId: project.id, scopes }, project },
    role: "admin",
  });
}

async function route(path: string) {
  const request = new Request(`https://example.test/api/v1${path}`, {
    headers: { authorization: "Bearer bsb_key_live_test_key" },
    method: "GET",
  });
  return handleApiRequest(request, path.split("?")[0]?.split("/").slice(1));
}

const backlinksPath = `/projects/${projectPublicId}/backlinks`;
const researchPath = `/projects/${projectPublicId}/keyword-research`;

describe("estimate-only scope for the two GET estimate operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate(["read"]);
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(null);
    mocks.getProvider.mockReturnValue(backlinksProvider);
    mocks.preflightBudget.mockResolvedValue(undefined);
    mocks.paidCall.mockImplementation(
      ({ call }: { call: (credentials: object) => Promise<unknown> }) => call({}),
    );
    mocks.backlinksCache.mockImplementation(async ({ load }: { load: () => Promise<unknown> }) => ({
      cached: false,
      status: "success",
      value: await load(),
    }));
    backlinksProvider.fetchBacklinksSummary.mockResolvedValue({ costCents: 2, summary: {} });
    backlinksProvider.fetchBacklinksHistory.mockResolvedValue({ costCents: 2, rows: [] });
    backlinksProvider.fetchBacklinksRows.mockResolvedValue({
      costCents: 1,
      rows: [],
      totalCount: 0,
    });
    mocks.prisma.$transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        backlinkSnapshot: {
          create: vi.fn().mockResolvedValue({
            costCents: 5,
            expiresAt: new Date("2026-09-18T12:00:00.000Z"),
            fetchedAt: new Date("2026-09-17T12:00:00.000Z"),
            fetchedRowCount: 0,
            history: [],
            includeSubdomains: true,
            publicId: "bls_1",
            rows: [],
            summary: {},
            target: "example.com",
            targetScope: "site",
            totalRowsAvailable: 0,
          }),
        },
      }),
    );
    mocks.keywordProject.mockResolvedValue(researchProject);
    mocks.rateContext.mockResolvedValue({ entries: [], manualAmountCents: null });
    mocks.keywordCache.mockResolvedValue(null);
    mocks.keywordCacheWrap.mockImplementation(
      async ({ load }: { load: () => Promise<unknown> }) => ({
        cached: false,
        status: "success",
        value: await load(),
      }),
    );
    researchProvider.fetchRelatedKeywords.mockResolvedValue({ costCents: 1, rows: [] });
  });

  it("runs both GET estimate paths with a read-scope key without spending budget", async () => {
    const backlinks = await route(`${backlinksPath}?target=example.com&estimate_only=true`);
    expect(backlinks.status).toBe(200);
    await expect(backlinks.json()).resolves.toMatchObject({
      data: { estimate: true, estimated_cost_cents: 7 },
    });

    const research = await route(`${researchPath}?seed=test&estimate_only=true`);
    expect(research.status).toBe(200);
    await expect(research.json()).resolves.toMatchObject({ estimate: true });

    expect(mocks.paidCall).not.toHaveBeenCalled();
    expect(mocks.preflightBudget).not.toHaveBeenCalled();
    expect(backlinksProvider.fetchBacklinksRows).not.toHaveBeenCalled();
    expect(researchProvider.fetchRelatedKeywords).not.toHaveBeenCalled();
  });

  it.each([
    ["backlinks without the flag", `${backlinksPath}?target=example.com`],
    ["backlinks estimate_only=false", `${backlinksPath}?target=example.com&estimate_only=false`],
    ["backlinks estimate_only=1", `${backlinksPath}?target=example.com&estimate_only=1`],
    ["research without the flag", `${researchPath}?seed=test`],
    ["research estimate_only=false", `${researchPath}?seed=test&estimate_only=false`],
    ["research estimate_only=1", `${researchPath}?seed=test&estimate_only=1`],
  ])("rejects a read-scope key for %s", async (_case, path) => {
    expect((await route(path)).status).toBe(403);
    expect(mocks.paidCall).not.toHaveBeenCalled();
    expect(mocks.preflightBudget).not.toHaveBeenCalled();
  });

  it("keeps write-scope keys working in estimate and paid mode", async () => {
    authenticate(["write"]);

    expect((await route(`${backlinksPath}?target=example.com&estimate_only=true`)).status).toBe(
      200,
    );
    expect((await route(`${backlinksPath}?target=example.com`)).status).toBe(200);

    expect((await route(`${researchPath}?seed=test&estimate_only=true`)).status).toBe(200);
    const paid = await route(`${researchPath}?seed=test`);
    expect(paid.status).toBe(200);

    expect(mocks.paidCall).toHaveBeenCalled();
    expect(mocks.preflightBudget).toHaveBeenCalled();
  });

  it("treats a read-scope personal token like a read-scope key", async () => {
    authenticatePersonalToken(["read"]);

    expect((await route(`${backlinksPath}?target=example.com&estimate_only=true`)).status).toBe(
      200,
    );
    expect((await route(`${backlinksPath}?target=example.com`)).status).toBe(403);
  });
});
