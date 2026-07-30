import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAlertRuleForProject, updateAlertRuleById } from "./alerts";
import type { ApiContext } from "./context";

const mocks = vi.hoisted(() => ({
  alertRuleApiResources: vi.fn(),
  createAlertRuleRecord: vi.fn(),
  listAlertRuleViews: vi.fn(),
  updateAlertRuleRecord: vi.fn(),
}));

vi.mock("@/lib/alerts/feed-mutations", () => ({
  markProjectAlertsRead: vi.fn(),
  muteTriggeredAlert: vi.fn(),
}));
vi.mock("./alert-list", () => ({
  listAlertRuleViews: mocks.listAlertRuleViews,
  listTriggeredAlertViews: vi.fn(),
}));
vi.mock("./alert-resources", () => ({
  alertRuleApiResources: mocks.alertRuleApiResources,
  triggeredAlertApiResources: vi.fn(),
}));
vi.mock("./alert-service", () => ({
  createAlertRuleRecord: mocks.createAlertRuleRecord,
  deleteAlertRuleRecord: vi.fn(),
  updateAlertRuleRecord: mocks.updateAlertRuleRecord,
}));

const rawRule = {
  channel: "Email",
  channels: ["email"],
  changePct: null,
  condition: "rank crosses below #10",
  conditionType: "threshold",
  competitorDomain: null,
  dropPositions: null,
  enabled: true,
  fires: "0 this week",
  id: "rule_db_1",
  name: "Rank drop",
  period: "Each check",
  recipientIds: ["user_db_1"],
  scope: "Selected keywords",
  serpFeature: null,
  severity: "urgent",
  status: "active",
  targetIds: ["keyword_db_1"],
  targetType: "keyword",
  thresholdPosition: 10,
  topN: null,
};

const publicRule = {
  ...rawRule,
  id: "alr_a00000000000000000000000",
  recipientIds: ["usr_a00000000000000000000000"],
  targetIds: ["kw_a00000000000000000000000"],
};

function context(path: string, body: unknown): ApiContext {
  const req = new Request(`https://api.example.test/api/v1${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return {
    auth: {
      apiKey: {
        id: "key_db_1",
        name: "Test key",
        prefix: "bsb_key_live_",
        projectId: "project_db_1",
        scopes: ["admin"],
      },
      project: {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        domain: "example.com",
        id: "project_db_1",
        name: "Example",
        publicId: "prj_a00000000000000000000000",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    headers: new Headers(),
    instance: "urn:test",
    method: "POST",
    path: [],
    req,
    url: new URL(req.url),
  } as ApiContext;
}

const input = {
  condition_type: "threshold",
  name: "Rank drop",
  recipient_ids: ["usr_a00000000000000000000000"],
  severity: "warning",
  target_ids: ["kw_a00000000000000000000000"],
  target_type: "keyword",
  threshold_position: 10,
};

describe("alert-rule REST mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.alertRuleApiResources.mockResolvedValue([publicRule]);
    mocks.createAlertRuleRecord.mockResolvedValue({
      id: "rule_db_1",
      publicId: "alr_a00000000000000000000000",
    });
    mocks.listAlertRuleViews.mockResolvedValue([publicRule]);
    mocks.updateAlertRuleRecord.mockResolvedValue({
      id: "rule_db_1",
      publicId: "alr_a00000000000000000000000",
    });
  });

  it("serializes created rules with public rule, recipient, and target IDs", async () => {
    const response = await createAlertRuleForProject(
      context("/projects/prj_a00000000000000000000000/alert-rules", input),
      "prj_a00000000000000000000000",
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "alr_a00000000000000000000000",
      recipient_ids: ["usr_a00000000000000000000000"],
      target_ids: ["kw_a00000000000000000000000"],
    });
    expect(mocks.createAlertRuleRecord).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning" }),
      expect.anything(),
    );
    expect(mocks.alertRuleApiResources).toHaveBeenCalledWith([publicRule]);
  });

  it("serializes updated rules with public rule, recipient, and target IDs", async () => {
    const response = await updateAlertRuleById(
      context("/alert-rules/alr_a00000000000000000000000", input),
      "alr_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "alr_a00000000000000000000000",
      recipient_ids: ["usr_a00000000000000000000000"],
      target_ids: ["kw_a00000000000000000000000"],
    });
    expect(mocks.updateAlertRuleRecord).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning" }),
      expect.anything(),
    );
    expect(mocks.alertRuleApiResources).toHaveBeenCalledWith([publicRule]);
  });
});
