import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findBacklinks: vi.fn(),
  findDomainOverview: vi.fn(),
  findKeywordResearch: vi.fn(),
  listBacklinks: vi.fn(),
  listDomainOverviews: vi.fn(),
  listKeywordResearch: vi.fn(),
  researchLocation: vi.fn(),
  researchProject: vi.fn(),
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  LEGACY_BEARER_PREFIXES: ["bsk_", "bsp_"],
  PERSONAL_TOKEN_PREFIX: "bsb_pat_live_",
  PROJECT_API_KEY_PREFIX: "bsb_key_",
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({
      headers: new Headers({ "RateLimit-Limit": "100", "RateLimit-Remaining": "99" }),
      success: true,
    }),
  ),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_input, execute) => execute()) }));
vi.mock("@/lib/backlinks/stored", () => ({
  findStoredBacklinks: mocks.findBacklinks,
  listStoredBacklinks: mocks.listBacklinks,
}));
vi.mock("@/lib/domain-overview/stored", () => ({
  findStoredDomainOverview: mocks.findDomainOverview,
  listStoredDomainOverviews: mocks.listDomainOverviews,
}));
vi.mock("@/lib/keyword-research/context", () => ({
  keywordResearchProject: mocks.researchProject,
  researchLocation: mocks.researchLocation,
}));
vi.mock("@/lib/keyword-research/stored-read", () => ({
  findStoredKeywordResearch: mocks.findKeywordResearch,
  listStoredKeywordResearch: mocks.listKeywordResearch,
}));

const projectPublicId = "prj_a00000000000000000000000";
const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "owner_1",
  publicId: projectPublicId,
  writeMode: "writable",
};

function authenticate(scopes: string[]) {
  mocks.auth.mockResolvedValue({
    apiKey: { id: "key_1", projectId: project.id, scopes },
    kind: "project_key",
    project,
  });
}

async function route(path: string, segments: string[]) {
  const request = new Request(`https://example.com/api/v1${path}`, {
    headers: { authorization: "Bearer bsb_key_live_test_key" },
    method: "GET",
  });
  return handleApiRequest(request, segments);
}

const backlinksListEntry = {
  freshUntil: "2026-09-12T10:00:00.000Z",
  includeSubdomains: true,
  mode: "as_is",
  savedAt: "2026-08-13T10:00:00.000Z",
  stale: false,
  target: "example.com",
  targetScope: "site",
};
const domainOverviewListEntry = {
  freshUntil: "2026-01-31T10:00:00.000Z",
  languageCode: "en",
  locationCode: 2840,
  savedAt: "2026-01-01T10:00:00.000Z",
  scope: "root",
  stale: true,
  target: "example.com",
};
const storedBacklinksReport = {
  cached: true,
  cachedUntil: "2026-08-14T10:00:00.000Z",
  costCents: 0,
  fetchedAt: "2026-08-13T10:00:00.000Z",
  fetchedRowCount: 2,
  history: [{ lostLinks: 1, month: "2026-07", newLinks: 2 }],
  includeSubdomains: true,
  ok: true,
  provider: "stored-source",
  rows: [
    {
      anchor: "example",
      sourceDomain: "referrer.example",
      sourceUrl: "https://referrer.example/page",
      status: "active",
      targetUrl: "https://example.com/",
    },
  ],
  summary: { backlinksTotal: 10, domainRank: 70, referringDomainsTotal: 5 },
  target: "example.com",
  targetScope: "site",
  totalRowsAvailable: 10,
  freshUntil: "2026-09-12T10:00:00.000Z",
  savedAt: "2026-08-13T10:00:00.000Z",
  stale: false,
};
const domainOverviewReport = {
  cached: true,
  costCents: 0,
  fetchedAt: "2026-01-01T10:00:00.000Z",
  freshUntil: "2026-01-31T10:00:00.000Z",
  history: [],
  languageCode: "en",
  locationCode: 2840,
  ok: true,
  overview: null,
  pages: null,
  previousFetchedAt: null,
  provider: "stored-source",
  savedAt: "2026-01-01T10:00:00.000Z",
  scope: "root",
  stale: true,
  state: "no_data",
  target: "example.com",
};
const keywordResearchReport = {
  cached: true,
  costCents: 0,
  countryCode: "US",
  fetchedAt: "2026-08-13T10:00:00.000Z",
  freshUntil: "2026-09-12T10:00:00.000Z",
  includeClickstream: false,
  languageCode: "en",
  mode: "auto",
  ok: true,
  provider: "stored-source",
  requestKey: "abc123",
  resultLimit: 100,
  rows: [],
  savedAt: "2026-08-13T10:00:00.000Z",
  seed: "rank tracker",
  sources: [],
  stale: false,
};

describe("stored research reports reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate(["read"]);
    mocks.listBacklinks.mockResolvedValue([backlinksListEntry]);
    mocks.listDomainOverviews.mockResolvedValue([domainOverviewListEntry]);
    mocks.listKeywordResearch.mockResolvedValue([]);
    mocks.findBacklinks.mockResolvedValue(storedBacklinksReport);
    mocks.findDomainOverview.mockResolvedValue(domainOverviewReport);
    mocks.findKeywordResearch.mockResolvedValue(keywordResearchReport);
    mocks.researchProject.mockResolvedValue(project);
    mocks.researchLocation.mockResolvedValue({ key: "US", value: { gl: "US", hl: "en" } });
  });

  it("lists stored reports with kind, state and fresh_until", async () => {
    const response = await route(`/projects/${projectPublicId}/research/reports`, [
      "projects",
      projectPublicId,
      "research",
      "reports",
    ]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      {
        kind: "backlinks",
        target: "example.com",
        target_scope: "site",
        mode: "as_is",
        include_subdomains: true,
        saved_at: "2026-08-13T10:00:00.000Z",
        fresh_until: "2026-09-12T10:00:00.000Z",
        state: "fresh",
      },
      {
        kind: "domain_overview",
        target: "example.com",
        target_scope: "root",
        language_code: "en",
        location_code: 2840,
        saved_at: "2026-01-01T10:00:00.000Z",
        fresh_until: "2026-01-31T10:00:00.000Z",
        state: "stale",
      },
    ]);
    expect(body.meta).toEqual({ freshness_days: 30 });
    expect(mocks.listBacklinks).toHaveBeenCalledWith({ projectId: "project_1" });
    expect(mocks.listDomainOverviews).toHaveBeenCalledWith({ projectId: "project_1" });
    expect(mocks.listKeywordResearch).toHaveBeenCalledWith({ projectId: "project_1" });
  });

  it("returns the stored backlinks envelope plus the storage fields", async () => {
    const response = await route(
      `/projects/${projectPublicId}/research/reports/backlinks?target=example.com&target_scope=site&mode=as_is`,
      ["projects", projectPublicId, "research", "reports", "backlinks"],
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findBacklinks).toHaveBeenCalledWith({
      includeSubdomains: true,
      mode: "as_is",
      projectId: "project_1",
      target: "example.com",
      targetScope: "site",
    });
    expect(body.data).toMatchObject({
      cached: true,
      cost_cents: 0,
      fetched_at: "2026-08-13T10:00:00.000Z",
      fresh_until: "2026-09-12T10:00:00.000Z",
      include_subdomains: true,
      saved_at: "2026-08-13T10:00:00.000Z",
      stale: false,
      state: "fresh",
      summary: { backlinks_total: 10, domain_rank: 70, referring_domains_total: 5 },
      target: "example.com",
      target_scope: "site",
      total_rows_available: 10,
      rows: [{ source_domain: "referrer.example", target_url: "https://example.com/" }],
    });
    expect(body.data).not.toHaveProperty("ok");
  });

  it("reads a stored domain overview by target and scope", async () => {
    const response = await route(
      `/projects/${projectPublicId}/research/reports/domain_overview?target=example.com&target_scope=root&location_code=2840&language_code=en`,
      ["projects", projectPublicId, "research", "reports", "domain_overview"],
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findDomainOverview).toHaveBeenCalledWith({
      languageCode: "en",
      locationCode: 2840,
      projectId: "project_1",
      scope: "root",
      target: "example.com",
    });
    expect(body.data).toMatchObject({
      data_state: "no_data",
      fresh_until: "2026-01-31T10:00:00.000Z",
      language_code: "en",
      location_code: 2840,
      previous_fetched_at: null,
      saved_at: "2026-01-01T10:00:00.000Z",
      scope: "root",
      stale: true,
      state: "stale",
      target: "example.com",
    });
  });

  it("reads a stored keyword research report by seed", async () => {
    const response = await route(
      `/projects/${projectPublicId}/research/reports/keyword_research?seed=rank%20tracker`,
      ["projects", projectPublicId, "research", "reports", "keyword_research"],
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findKeywordResearch).toHaveBeenCalledWith({
      projectId: "project_1",
      requestKey: expect.any(String),
    });
    expect(body.data).toMatchObject({
      fresh_until: "2026-09-12T10:00:00.000Z",
      saved_at: "2026-08-13T10:00:00.000Z",
      seed: "rank tracker",
      state: "fresh",
    });
  });
});
