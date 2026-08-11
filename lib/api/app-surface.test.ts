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
  alertList: {
    listAlertRuleViews: vi.fn(),
    listTriggeredAlertViews: vi.fn(),
  },
  alertResources: {
    alertRuleApiResources: vi.fn(),
    triggeredAlertApiResources: vi.fn(),
  },
  alertService: {
    createAlertRuleRecord: vi.fn(),
    deleteAlertRuleRecord: vi.fn(),
    updateAlertRuleRecord: vi.fn(),
  },
  authenticateBearer: vi.fn(),
  providerService: {
    connectProviderConnection: vi.fn(),
    disconnectProviderConnection: vi.fn(),
    setProviderSettings: vi.fn(),
    testProviderConnection: vi.fn(),
  },
  providerList: { listProviderCategories: vi.fn() },
  queries: {
    getCloudImportView: vi.fn(),
    getCompetitorsApiView: vi.fn(),
    getNotificationPreferences: vi.fn(),
    getTeamAccess: vi.fn(),
    listSavedViews: vi.fn(),
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

vi.mock("./alert-service", () => ({
  createAlertRuleRecord: mocks.alertService.createAlertRuleRecord,
  deleteAlertRuleRecord: mocks.alertService.deleteAlertRuleRecord,
  updateAlertRuleRecord: mocks.alertService.updateAlertRuleRecord,
}));
vi.mock("./alert-list", () => ({
  listAlertRuleViews: mocks.alertList.listAlertRuleViews,
  listTriggeredAlertViews: mocks.alertList.listTriggeredAlertViews,
}));
vi.mock("./alert-resources", () => ({
  alertRuleApiResources: mocks.alertResources.alertRuleApiResources,
  triggeredAlertApiResources: mocks.alertResources.triggeredAlertApiResources,
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
vi.mock("./provider-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./provider-service")>();
  return {
    ...actual,
    connectProviderConnection: mocks.providerService.connectProviderConnection,
    disconnectProviderConnection: mocks.providerService.disconnectProviderConnection,
    setProviderSettings: mocks.providerService.setProviderSettings,
    testProviderConnection: mocks.providerService.testProviderConnection,
  };
});
vi.mock("./provider-list", () => ({
  listProviderCategories: mocks.providerList.listProviderCategories,
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
vi.mock("@/lib/queries/cloud", () => ({ getCloudImportView: mocks.queries.getCloudImportView }));

const ids = {
  alert: "al_aaaaaaaaaaaaaaaaaaaaaaaa",
  competitor: "cmp_aaaaaaaaaaaaaaaaaaaaaaaa",
  invite: "inv_aaaaaaaaaaaaaaaaaaaaaaaa",
  job: "imp_aaaaaaaaaaaaaaaaaaaaaaaa",
  keyword: "kw_aaaaaaaaaaaaaaaaaaaaaaaa",
  member: "mbr_aaaaaaaaaaaaaaaaaaaaaaaa",
  migrationToken: "ferry_aaaaaaaaaaaaaaaaaaaaaaaa",
  project: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
  rule: "alr_aaaaaaaaaaaaaaaaaaaaaaaa",
  savedView: "viw_aaaaaaaaaaaaaaaaaaaaaaaa",
  connection: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
} as const;

const project = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: ids.project,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

function request(method: string, path: string, body?: unknown) {
  return new Request(`https://example.test/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: "Bearer bsb_key_live_test_key",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
}

async function call(method: string, path: string, body?: unknown) {
  const routePath = path.split("?")[0].split("/").filter(Boolean);
  return handleApiRequest(request(method, path, body), routePath);
}

describe("public API app surface routes", () => {
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
    mocks.alertList.listAlertRuleViews.mockResolvedValue([
      { conditionType: "threshold", id: ids.rule, name: "Drop" },
    ]);
    mocks.alertList.listTriggeredAlertViews.mockResolvedValue([
      { id: ids.alert, conditionType: "threshold", firedAt: "now" },
    ]);
    mocks.alertResources.alertRuleApiResources.mockImplementation(async (rules) => rules);
    mocks.alertResources.triggeredAlertApiResources.mockImplementation(async (alerts) => alerts);
    mocks.queries.getTeamAccess.mockResolvedValue({
      members: [{ email: "owner@example.com", id: ids.member, roleValue: "owner" }],
      pendingInvites: [{ email: "new@example.com", id: ids.invite, roleValue: "viewer" }],
    });
    mocks.providerList.listProviderCategories.mockResolvedValue([
      { id: "serp", providers: [{ id: "serpapi", name: "SerpApi" }], title: "SERP" },
    ]);
    mocks.queries.listSavedViews.mockResolvedValue([
      { createdAt: "2026-01-01", id: ids.savedView, name: "All" },
    ]);
    mocks.queries.getCompetitorsApiView.mockResolvedValue({
      managedCompetitors: [{ domain: "rankzly.io", id: ids.competitor, label: "Rankzly" }],
      markets: [],
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
    for (const fn of Object.values(mocks.alertService)) fn.mockResolvedValue({ id: "ok_1" });
    for (const fn of Object.values(mocks.providerService)) fn.mockResolvedValue({ id: "ok_1" });
    mocks.alertService.createAlertRuleRecord.mockResolvedValue({
      id: "rule_db_1",
      publicId: ids.rule,
    });
    mocks.alertService.updateAlertRuleRecord.mockResolvedValue({
      id: "rule_db_1",
      publicId: ids.rule,
    });
    const providerConnection = {
      costPerCheckCents: 1,
      credentialsEncrypted: "encrypted_secret",
      enabled: true,
      id: "provider_connection_db_1",
      kind: "serp",
      priority: 0,
      provider: "serpapi",
      publicId: ids.connection,
      status: "active",
    };
    mocks.providerService.connectProviderConnection.mockResolvedValue(providerConnection);
    mocks.providerService.setProviderSettings.mockResolvedValue(providerConnection);
    mocks.providerService.testProviderConnection.mockResolvedValue({ message: "ok", ok: true });
    mocks.providerService.disconnectProviderConnection.mockResolvedValue({ ok: true });
  });

  it("serves alert rules and triggered alerts", async () => {
    const listRules = await call("GET", `/projects/${ids.project}/alert-rules?limit=1`);
    const triggered = await call("GET", `/projects/${ids.project}/triggered-alerts`);
    const created = await call("POST", `/projects/${ids.project}/alert-rules`, {
      condition_type: "threshold",
      name: "Drop",
      threshold_position: 10,
    });
    const updated = await call("PATCH", `/alert-rules/${ids.rule}`, {
      condition_type: "threshold",
      name: "Drop",
      threshold_position: 9,
    });
    const deleted = await call("DELETE", `/alert-rules/${ids.rule}`);

    expect([
      listRules.status,
      triggered.status,
      created.status,
      updated.status,
      deleted.status,
    ]).toEqual([200, 200, 201, 200, 200]);
    expect(mocks.alertList.listAlertRuleViews).toHaveBeenCalledWith("project_1");
    expect(mocks.alertList.listTriggeredAlertViews).toHaveBeenCalledWith("project_1");
    expect(mocks.alertService.createAlertRuleRecord).toHaveBeenCalledWith(
      expect.objectContaining({ conditionType: "threshold" }),
      { actorId: null, projectId: "project_1" },
    );
    expect(mocks.alertService.updateAlertRuleRecord).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project_1", ruleId: ids.rule }),
      { actorId: null, projectId: "project_1" },
    );
    expect(mocks.alertService.deleteAlertRuleRecord).toHaveBeenCalledWith(
      { ruleId: ids.rule },
      { actorId: null, projectId: "project_1" },
    );
  });

  it("serves team members and invite mutations", async () => {
    const members = await call("GET", `/projects/${ids.project}/team/members`);
    const invites = await call("GET", `/projects/${ids.project}/team/invites`);
    const created = await call("POST", `/projects/${ids.project}/team/invites`, {
      email: "new@example.com",
      role: "viewer",
    });
    const revoked = await call("DELETE", `/projects/${ids.project}/team/invites/${ids.invite}`);

    expect([members.status, invites.status, created.status, revoked.status]).toEqual([
      200, 200, 201, 200,
    ]);
    expect(mocks.actions.inviteMember).toHaveBeenCalledWith(
      { email: "new@example.com", projectId: ids.project, role: "viewer" },
      expect.objectContaining({ auditActorId: null }),
    );
    expect(mocks.actions.revokeInvite).toHaveBeenCalledWith(
      { inviteId: ids.invite, projectId: ids.project },
      expect.objectContaining({ auditActorId: null }),
    );
  });

  it("serves provider list, connect, test, settings, and disconnect", async () => {
    const list = await call("GET", `/projects/${ids.project}/providers`);
    const connect = await call("POST", `/projects/${ids.project}/providers/serpapi/connect`, {
      cost_per_check: 0.01,
      credentials: { api_key: "secret" },
      primary: true,
    });
    const test = await call("POST", `/projects/${ids.project}/providers/serpapi/test`, {});
    const patch = await call("PATCH", `/projects/${ids.project}/providers/serpapi`, {
      enabled: false,
      priority: 20,
    });
    const deleted = await call("DELETE", `/projects/${ids.project}/providers/serpapi`);

    expect([list.status, connect.status, test.status, patch.status, deleted.status]).toEqual([
      200, 201, 200, 200, 200,
    ]);
    expect(mocks.providerService.connectProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({ costPerCheck: 0.01, providerId: "serpapi" }),
      { actorId: null, projectId: "project_1", projectPublicId: ids.project },
    );
    expect(mocks.providerService.testProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "serpapi" }),
      { actorId: null, projectId: "project_1", projectPublicId: ids.project },
    );
    expect(mocks.providerService.setProviderSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, priority: 20 }),
      { actorId: null, projectId: "project_1", projectPublicId: ids.project },
    );
    expect(mocks.providerService.disconnectProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: ids.project, providerId: "serpapi" }),
      { actorId: null, projectId: "project_1", projectPublicId: ids.project },
    );
    const connectBody = await connect.json();
    const patchBody = await patch.json();
    expect(connectBody).toMatchObject({ connection_id: ids.connection, id: "serpapi" });
    expect(patchBody).toMatchObject({ connection_id: ids.connection, id: "serpapi" });
    expect(JSON.stringify(connectBody)).not.toContain("provider_connection_db_1");
    expect(JSON.stringify(patchBody)).not.toContain("encrypted_secret");
  });
});
