import { hashApiKey } from "@/lib/providers/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIdempotencyForTests } from "./idempotency";
import { resetRateLimitStateForTests } from "./ratelimit";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    alertRule: {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    alertRuleTarget: { deleteMany: vi.fn() },
    apiKey: { findMany: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    keyword: { findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    tag: { findMany: vi.fn() },
    triggeredAlert: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    webhookEndpoint: { findMany: vi.fn() },
  };

  return {
    getSession: vi.fn(() => {
      throw new Error("REST path must not read the session");
    }),
    prisma,
    requireRole: vi.fn(() => {
      throw new Error("REST path must not read the session");
    }),
    requireSession: vi.fn(() => {
      throw new Error("REST path must not read the session");
    }),
    writeAudit: vi.fn((input, client = prisma) => client.auditLog.create({ data: input })),
  };
});

vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
  requireRole: mocks.requireRole,
  requireSession: mocks.requireSession,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rawKey = "bsb_key_test_1234567890abcdef";
const projectPublicId = "prj_a00000000000000000000000";
const rulePublicId = "alr_a00000000000000000000000";

function project() {
  return {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: projectPublicId,
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

function authRow() {
  return {
    hashedKey: hashApiKey(rawKey),
    id: "api_key_1",
    name: "Production",
    prefix: rawKey.slice(0, 21),
    project: project(),
    projectId: "project_1",
    revokedAt: null,
    scopes: ["admin"],
  };
}

function alertRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    changePct: null,
    channels: ["email"],
    competitorDomain: null,
    conditionType: "threshold",
    dropPositions: null,
    enabled: true,
    id: "rule_1",
    name: "Drop",
    projectId: "project_1",
    publicId: rulePublicId,
    recipients: [],
    serpFeature: null,
    severity: "urgent",
    targetType: "all",
    targets: [],
    thresholdPosition: 10,
    topN: null,
    triggered: [],
    ...overrides,
  };
}

function triggeredAlertRow() {
  return {
    afterPosition: 12,
    beforePosition: 8,
    deliveryAttempts: [],
    deliveryState: "delivered",
    firedAt: new Date("2026-01-04T00:00:00.000Z"),
    id: "ta_1",
    keyword: {
      device: "desktop",
      locationRef: { displayName: "United States" },
    },
    keywordId: "keyword_1",
    payload: null,
    publicId: "al_a00000000000000000000000",
    rule: {
      conditionType: "threshold",
      name: "Drop",
      projectId: "project_1",
      severity: "urgent",
    },
    status: "firing",
  };
}

function authedRequest(method: string, path: string, body?: unknown) {
  return new Request(`https://example.test/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: `Bearer ${rawKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
}

async function call(req: Request, path: string) {
  return handleApiRequest(req, path.split("?")[0].split("/").filter(Boolean));
}

const validRuleBody = {
  condition_type: "threshold",
  name: "Drop",
  threshold_position: 10,
};

describe("alert API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStateForTests();
    resetIdempotencyForTests();
    process.env.BISIBILITY_API_KEY_RATE_LIMIT_PER_MINUTE = "100";
    process.env.BISIBILITY_API_ANON_RATE_LIMIT_PER_MINUTE = "100";
    process.env.REDIS_URL = "";
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.apiKey.findMany.mockResolvedValue([authRow()]);
    mocks.prisma.apiKey.update.mockResolvedValue({ id: "api_key_1" });
    mocks.prisma.auditLog.create.mockResolvedValue({});
    mocks.prisma.alertRule.findMany.mockResolvedValue([alertRuleRow()]);
    mocks.prisma.alertRule.count.mockResolvedValue(0);
    mocks.prisma.alertRule.findFirst.mockResolvedValue(alertRuleRow());
    mocks.prisma.alertRule.create.mockResolvedValue(alertRuleRow());
    mocks.prisma.alertRule.update.mockResolvedValue(alertRuleRow({ name: "Updated" }));
    mocks.prisma.alertRule.delete.mockResolvedValue(alertRuleRow());
    mocks.prisma.alertRuleTarget.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.tag.findMany.mockResolvedValue([]);
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([triggeredAlertRow()]);
    mocks.prisma.user.findMany.mockResolvedValue([]);
    mocks.prisma.webhookEndpoint.findMany.mockResolvedValue([]);
  });

  it("lists alert rules using the internal project id", async () => {
    const response = await call(
      authedRequest("GET", `/projects/${projectPublicId}/alert-rules`),
      `/projects/${projectPublicId}/alert-rules`,
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.alertRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1" } }),
    );
  });

  it("creates alert rules as API-owned records", async () => {
    const response = await call(
      authedRequest("POST", `/projects/${projectPublicId}/alert-rules`, validRuleBody),
      `/projects/${projectPublicId}/alert-rules`,
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdById: null, projectId: "project_1" }),
      include: { recipients: { select: { userId: true } }, targets: true },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "alert_rule.create", actorId: null }),
    );
  });

  it.each([
    [
      "URL mismatch",
      { condition_type: "url_mismatch", name: "Wrong URL" },
      { conditionType: "url_mismatch" },
    ],
    [
      "position drop",
      { condition_type: "position_drop", drop_positions: 5, name: "Dropped" },
      { conditionType: "position_drop", dropPositions: 5 },
    ],
    [
      "downtrend",
      { condition_type: "downtrend", name: "Downtrend" },
      { conditionType: "downtrend" },
    ],
  ])("accepts %s alert rules", async (_name, body, data) => {
    const response = await call(
      authedRequest("POST", `/projects/${projectPublicId}/alert-rules`, body),
      `/projects/${projectPublicId}/alert-rules`,
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining(data),
      include: { recipients: { select: { userId: true } }, targets: true },
    });
  });

  it("updates alert rules without reading session state", async () => {
    const response = await call(
      authedRequest("PATCH", `/alert-rules/${rulePublicId}`, validRuleBody),
      `/alert-rules/${rulePublicId}`,
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.alertRuleTarget.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "rule_1" },
    });
  });

  it("deletes alert rules and audits with a null actor", async () => {
    const response = await call(
      authedRequest("DELETE", `/alert-rules/${rulePublicId}`),
      `/alert-rules/${rulePublicId}`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "alert_rule.delete", actorId: null }),
    );
  });

  it("lists triggered alerts with the visible snooze filter", async () => {
    const response = await call(
      authedRequest("GET", `/projects/${projectPublicId}/triggered-alerts`),
      `/projects/${projectPublicId}/triggered-alerts`,
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.triggeredAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }],
          rule: { projectId: "project_1" },
        }),
      }),
    );
  });

  it("maps missing alert rules to problem details", async () => {
    mocks.prisma.alertRule.findFirst.mockResolvedValue(null);

    const response = await call(
      authedRequest("PATCH", `/alert-rules/${rulePublicId}`, validRuleBody),
      `/alert-rules/${rulePublicId}`,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({
      detail: "Alert rule not found.",
      status: 404,
    });
  });
});
