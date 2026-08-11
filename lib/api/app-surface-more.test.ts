import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  actions: {
    addManagedCompetitor: vi.fn(),
    connectProvider: vi.fn(),
    createSavedView: vi.fn(),
    deleteSavedView: vi.fn(),
    disconnectProvider: vi.fn(),
    inviteMember: vi.fn(),
    mintMigrationToken: vi.fn(),
    removeManagedCompetitor: vi.fn(),
    revokeInvite: vi.fn(),
    revokeMigrationToken: vi.fn(),
    updateProviderSettings: vi.fn(),
    testConnection: vi.fn(),
    updateNotificationPreferences: vi.fn(),
  },
  authenticateBearer: vi.fn(),
  queries: {
    getCloudImportView: vi.fn(),
    getCompetitorsApiView: vi.fn(),
    getIntegrationCategories: vi.fn(),
    getNotificationPreferences: vi.fn(),
    getTeamAccess: vi.fn(),
    listSavedViews: vi.fn(),
  },
  tokenService: {
    assertMintRateLimit: vi.fn(),
    mint: vi.fn(),
    revoke: vi.fn(),
  },
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({
  makePublicId: vi.fn((prefix: string) => `${prefix}_generated`),
  parseActionInput: vi.fn((schema, input) => schema.parse(input)),
}));
vi.mock("@/lib/actions/team", () => ({
  inviteMember: mocks.actions.inviteMember,
  revokeInvite: mocks.actions.revokeInvite,
}));
vi.mock("@/lib/team/service", () => ({
  changeTeamMemberRole: vi.fn(),
  inviteTeamMember: mocks.actions.inviteMember,
  removeTeamMember: vi.fn(),
  resendTeamInvite: vi.fn(),
  revokeTeamInvite: mocks.actions.revokeInvite,
}));
vi.mock("@/lib/queries/team", () => ({ getTeamAccess: mocks.queries.getTeamAccess }));
vi.mock("@/lib/actions/providers", () => ({
  connectProvider: mocks.actions.connectProvider,
  disconnectProvider: mocks.actions.disconnectProvider,
  updateProviderSettings: mocks.actions.updateProviderSettings,
  testConnection: mocks.actions.testConnection,
}));
vi.mock("@/lib/queries/integrations", () => ({
  getIntegrationCategories: mocks.queries.getIntegrationCategories,
}));
vi.mock("@/lib/actions/saved-views", () => ({
  createSavedView: mocks.actions.createSavedView,
  deleteSavedView: mocks.actions.deleteSavedView,
}));
vi.mock("@/lib/queries/saved-views", () => ({ listSavedViews: mocks.queries.listSavedViews }));
vi.mock("@/lib/actions/competitors", () => ({
  addManagedCompetitor: mocks.actions.addManagedCompetitor,
  removeManagedCompetitor: mocks.actions.removeManagedCompetitor,
}));
vi.mock("@/lib/queries/competitors", () => ({
  getCompetitorsApiView: mocks.queries.getCompetitorsApiView,
}));
vi.mock("@/lib/actions/notification-prefs", () => ({
  updateNotificationPreferences: mocks.actions.updateNotificationPreferences,
}));
vi.mock("@/lib/queries/notification-prefs", () => ({
  getNotificationPreferences: mocks.queries.getNotificationPreferences,
}));
vi.mock("@/lib/actions/cloud", () => ({
  mintMigrationToken: mocks.actions.mintMigrationToken,
  revokeMigrationToken: mocks.actions.revokeMigrationToken,
}));
vi.mock("@/lib/migration/token-service", () => ({
  assertMigrationTokenMintRateLimit: mocks.tokenService.assertMintRateLimit,
  mintMigrationTokenForProject: mocks.tokenService.mint,
  revokeMigrationTokenForProject: mocks.tokenService.revoke,
}));
vi.mock("@/lib/queries/cloud", () => ({ getCloudImportView: mocks.queries.getCloudImportView }));

const ids = {
  competitor: "cmp_aaaaaaaaaaaaaaaaaaaaaaaa",
  job: "imp_aaaaaaaaaaaaaaaaaaaaaaaa",
  keyword: "kw_aaaaaaaaaaaaaaaaaaaaaaaa",
  migrationToken: "ferry_aaaaaaaaaaaaaaaaaaaaaaaa",
  project: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
  savedView: "viw_aaaaaaaaaaaaaaaaaaaaaaaa",
} as const;

const project = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "owner_1",
  publicId: ids.project,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

function request(method: string, path: string, body?: unknown) {
  return new Request(`https://example.com/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: "Bearer bsb_key_live_test_key",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
}

async function call(method: string, path: string, body?: unknown) {
  return handleApiRequest(
    request(method, path, body),
    path.split("?")[0].split("/").filter(Boolean),
  );
}

describe("public API remaining app surface routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["admin"],
      },
      project,
    });
    mocks.queries.listSavedViews.mockResolvedValue([
      { createdById: "user_db_1", id: ids.savedView, name: "All" },
    ]);
    mocks.queries.getCompetitorsApiView.mockResolvedValue({
      managedCompetitors: [
        {
          domain: "competitor.example.com",
          id: ids.competitor,
          label: "Competitor",
        },
      ],
      markets: [
        {
          columns: [{ domain: "example.com", kind: "You", label: "You" }],
          device: "desktop",
          engine: "google",
          location: "United States",
          rows: [{ gap: null, id: ids.keyword, keyword: "rank tracker", ranks: {} }],
          shares: [{ domain: "example.com", shareOfVoice: 100, sharedKeywords: 1 }],
        },
      ],
      suggestions: [],
    });
    mocks.queries.getNotificationPreferences.mockResolvedValue({
      alertEmail: true,
      alertInApp: true,
      alertSlack: false,
      alertWebhook: false,
      checkEmail: false,
      checkInApp: true,
      email: "owner@example.com",
      emailVerification: "verified",
      importEmail: true,
      importInApp: true,
      inviteEmail: true,
      inviteInApp: true,
      projectId: ids.project,
      slackAvailable: false,
      webhookAvailable: false,
    });
    mocks.queries.getCloudImportView.mockResolvedValue({
      activeToken: { createdAt: "2026-01-01", id: ids.migrationToken, scope: "full" },
      importJob: { id: ids.job, state: "idle" },
    });
    for (const fn of Object.values(mocks.actions)) fn.mockResolvedValue({ id: "ok_1" });
    mocks.tokenService.assertMintRateLimit.mockResolvedValue(undefined);
    mocks.tokenService.mint.mockResolvedValue({
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T01:00:00.000Z",
      id: ids.migrationToken,
      importJob: { id: ids.job, state: "idle" },
      scope: "keywords",
      singleUse: true,
      token: "mig_secret",
    });
    mocks.tokenService.revoke.mockResolvedValue({
      id: ids.migrationToken,
      revokedAt: "2026-01-01T00:30:00.000Z",
    });
  });

  it("serves saved views and competitors", async () => {
    const views = await call("GET", `/projects/${ids.project}/saved-views`);
    const createView = await call("POST", `/projects/${ids.project}/saved-views`, {
      config: {},
      name: "Mine",
    });
    const deleteView = await call(
      "DELETE",
      `/projects/${ids.project}/saved-views/${ids.savedView}`,
    );
    const competitors = await call("GET", `/projects/${ids.project}/competitors`);
    const addCompetitor = await call("POST", `/projects/${ids.project}/competitors`, {
      domain: "competitor.example.com",
    });
    const removeCompetitor = await call(
      "DELETE",
      `/projects/${ids.project}/competitors/${ids.competitor}`,
    );

    expect([
      views.status,
      createView.status,
      deleteView.status,
      competitors.status,
      addCompetitor.status,
      removeCompetitor.status,
    ]).toEqual([200, 201, 200, 200, 201, 200]);
    expect(mocks.actions.createSavedView).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mine", projectId: ids.project }),
    );
    expect(mocks.actions.deleteSavedView).toHaveBeenCalledWith({
      projectId: ids.project,
      viewId: ids.savedView,
    });
    expect(mocks.actions.addManagedCompetitor).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "competitor.example.com",
        projectId: ids.project,
      }),
    );
    expect(mocks.actions.removeManagedCompetitor).toHaveBeenCalledWith({
      competitorId: ids.competitor,
      projectId: ids.project,
    });
    expect(JSON.stringify(await views.json())).not.toContain("user_db_1");
    await expect(competitors.json()).resolves.toMatchObject({
      meta: {
        markets: [
          {
            columns: [{ domain: "example.com" }],
            country: "United States",
            device: "Desktop",
            engine: "Google",
            rows: [{ id: ids.keyword }],
            shares: [{ domain: "example.com" }],
          },
        ],
      },
    });
  });

  it("rejects saved view creation without a config", async () => {
    const response = await call("POST", `/projects/${ids.project}/saved-views`, {
      name: "Missing",
    });

    expect(response.status).toBe(400);
    expect(mocks.actions.createSavedView).not.toHaveBeenCalled();
  });

  it("lists and creates competitor saved views through the public API", async () => {
    const listResponse = await call(
      "GET",
      `/projects/${ids.project}/saved-views?surface=competitors`,
    );
    const createResponse = await call("POST", `/projects/${ids.project}/saved-views`, {
      config: {
        filters: { excluded_keyword_ids: [ids.keyword], position: "all", tag: null },
        scope: { device: "desktop", engine: "google", location_id: "location_us" },
      },
      name: "US desktop",
      surface: "competitors",
    });

    expect([listResponse.status, createResponse.status]).toEqual([200, 201]);
    expect(mocks.queries.listSavedViews).toHaveBeenCalledWith(ids.project, "competitors");
    expect(mocks.actions.createSavedView).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ surface: "competitors", version: 1 }),
        name: "US desktop",
      }),
    );
  });

  it("serves notification preferences and migration tokens", async () => {
    const prefs = await call("GET", `/projects/${ids.project}/notification-preferences`);
    const updatePrefs = await call("PATCH", `/projects/${ids.project}/notification-preferences`, {
      check_email: true,
    });
    const tokens = await call("GET", `/projects/${ids.project}/migration-tokens`);
    const mint = await call("POST", `/projects/${ids.project}/migration-tokens`, {
      scope: "keywords",
    });
    const revoke = await call(
      "DELETE",
      `/projects/${ids.project}/migration-tokens/${ids.migrationToken}`,
    );

    expect([prefs.status, updatePrefs.status, tokens.status, mint.status, revoke.status]).toEqual([
      200, 200, 200, 201, 200,
    ]);
    expect(mocks.actions.updateNotificationPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ checkEmail: true, projectId: ids.project }),
    );
    expect(mocks.tokenService.mint).toHaveBeenCalledWith({
      action: "migration_token.mint",
      actorId: "owner_1",
      projectId: "project_1",
      scope: "keywords",
    });
    expect(mocks.tokenService.revoke).toHaveBeenCalledWith({
      actorId: "owner_1",
      projectId: "project_1",
      tokenId: ids.migrationToken,
    });
  });

  it("lists the new route surface in openapi", async () => {
    const body = await (await call("GET", "/openapi.json")).json();

    expect(body.paths).toMatchObject({
      "/projects/{project_id}/alert-rules": expect.any(Object),
      "/projects/{project_id}/migration-tokens": expect.any(Object),
      "/projects/{project_id}/providers/{provider_id}/connect": expect.any(Object),
      "/projects/{project_id}/team/members": expect.any(Object),
    });
  });
});
