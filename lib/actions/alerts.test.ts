import { PRIVATE_NETWORK_WEBHOOK_ERROR } from "@/lib/alerts/webhook-target";
import { decryptSecret } from "@/lib/providers/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAlertRule,
  createKeywordAlertRule,
  deleteAlertRule,
  deleteWebhookEndpoint,
  testWebhookEndpoint,
  updateAlertRule,
  upsertWebhookEndpoint,
} from "./alerts";

const keywordPublicId = "kw_a00000000000000000000000";
const marketPublicId = "pmkt_a00000000000000000000000";
const projectPublicId = "prj_a00000000000000000000000";
const rulePublicId = "alr_a00000000000000000000000";
const tagPublicId = "tag_a00000000000000000000000";
const webhookPublicId = "we_a00000000000000000000000";

const mocks = vi.hoisted(() => {
  class DeliveryHttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly retryAfterSeconds: number | null,
      readonly latencyMs: number | null,
    ) {
      super(message);
    }
  }
  class AuthorizationError extends Error {
    constructor(readonly code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.name = "AuthorizationError";
    }
  }
  const roleRank = { admin: 2, auditor: 0.5, member: 1, owner: 3, viewer: 0 };
  const minimumRoleByAction = {
    create: "member",
    delete: "admin",
    manage: "admin",
    read: "viewer",
    update: "member",
  } as const;
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    alertRule: {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    alertRuleMarket: { deleteMany: vi.fn() },
    alertRuleTarget: { deleteMany: vi.fn() },
    keyword: { findMany: vi.fn() },
    project: { findFirst: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    slackConnection: { findUnique: vi.fn(), update: vi.fn() },
    tag: { findMany: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    webhookEndpoint: {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    assertWebhookUrlAllowed: vi.fn(),
    AuthorizationError,
    DeliveryHttpError,
    authorize: vi.fn((actor, action, resource) => {
      if (!actor) {
        throw new AuthorizationError("unauthenticated");
      }
      const role = resource.projectId
        ? actor.memberships?.find(
            (item: { projectId: string }) => item.projectId === resource.projectId,
          )?.role
        : actor.role;
      const requiredRole =
        resource.requiredRole ?? minimumRoleByAction[action as keyof typeof minimumRoleByAction];
      if (
        !role ||
        roleRank[role as keyof typeof roleRank] < roleRank[requiredRole as keyof typeof roleRank]
      ) {
        throw new AuthorizationError("forbidden");
      }
      return { actorId: actor.id, projectId: resource.projectId, role };
    }),
    prisma,
    requireSession: vi.fn(),
    requiredPublicAuditId: vi.fn((value) => value),
    revalidatePath: vi.fn(),
    postSignedWebhookTest: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: mocks.requiredPublicAuditId,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/alerts/webhook-guard", () => ({
  assertWebhookUrlAllowed: mocks.assertWebhookUrlAllowed,
}));
vi.mock("@/lib/alerts/delivery", () => ({
  DeliveryHttpError: mocks.DeliveryHttpError,
  postSignedWebhookTest: mocks.postSignedWebhookTest,
}));

function mockActor(role: "admin" | "member" | "viewer") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

function mockProject() {
  mocks.prisma.project.findFirst.mockResolvedValue({
    domain: "example.com",
    id: "project_1",
    ownerId: "user_1",
    publicId: projectPublicId,
  });
}

describe("alert actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockActor("admin");
    mockProject();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "project_1" }]);
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(0);
    mocks.prisma.alertRule.count.mockResolvedValue(0);
    mocks.assertWebhookUrlAllowed.mockResolvedValue(undefined);
    mocks.postSignedWebhookTest.mockResolvedValue({ latencyMs: 12, status: 204 });
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);
    mocks.prisma.user.findMany.mockImplementation(({ where }) => {
      const ids = (where.OR as { id?: { in?: string[] } }[]).flatMap(
        (condition) => condition.id?.in ?? [],
      );
      return Promise.resolve(ids.map((id) => ({ id })));
    });
    mocks.writeAudit.mockResolvedValue({});
  });

  it("rejects invalid rule input before reading the session", async () => {
    await expect(createAlertRule({ name: "", projectId: projectPublicId })).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("creates a keyword-targeted rule only after target ownership is verified", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([{ id: "keyword_1" }]);
    mocks.prisma.alertRule.create.mockResolvedValue({
      id: "rule_1",
      name: "Slipped",
      publicId: rulePublicId,
      targets: [{ keywordId: "keyword_1" }],
    });

    await createAlertRule({
      channels: ["email"],
      conditionType: "exits_top_n",
      name: "Slipped",
      projectId: projectPublicId,
      targetIds: [keywordPublicId],
      targetType: "keyword",
      topN: 10,
    });

    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "project_1" }) }),
    );
    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channels: ["email"],
        createdById: "user_1",
        projectId: "project_1",
        targets: { create: [{ keywordId: "keyword_1" }] },
      }),
      include: {
        markets: { include: { projectMarket: { select: { publicId: true } } } },
        recipients: { select: { userId: true } },
        targets: true,
      },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "alert_rule.create",
        targetId: rulePublicId,
      }),
    );
  });

  it("returns the project rule limit as a handled action result", async () => {
    mocks.prisma.alertRule.count.mockResolvedValue(50);

    await expect(
      createAlertRule({
        channels: [],
        conditionType: "threshold",
        name: "Rule 51",
        projectId: projectPublicId,
        targetIds: [],
        targetType: "all",
        thresholdPosition: 10,
      }),
    ).resolves.toEqual({
      error:
        "Alert rule limit reached: a project can have at most 50 alert rules. Delete an existing rule before creating another.",
      ok: false,
    });
    expect(mocks.prisma.alertRule.create).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("persists only selected active markets from the authorized project", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ id: "project_market_1" }]);
    mocks.prisma.alertRule.create.mockResolvedValue({
      id: "rule_1",
      markets: [{ projectMarket: { publicId: marketPublicId } }],
      name: "Scoped rule",
      publicId: rulePublicId,
      targets: [],
    });

    await createAlertRule({
      channels: [],
      conditionType: "threshold",
      marketIds: [marketPublicId],
      name: "Scoped rule",
      projectId: projectPublicId,
      thresholdPosition: 10,
    });

    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        OR: [{ id: { in: [marketPublicId] } }, { publicId: { in: [marketPublicId] } }],
        projectId: "project_1",
        status: "active",
      },
    });
    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          markets: { create: [{ projectMarketId: "project_market_1" }] },
        }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ marketIds: [marketPublicId] }),
      }),
    );
  });

  it("rejects a missing, paused, or cross-project market before creating the rule", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);

    await expect(
      createAlertRule({
        channels: [],
        conditionType: "threshold",
        marketIds: [marketPublicId],
        name: "Scoped rule",
        projectId: projectPublicId,
        thresholdPosition: 10,
      }),
    ).rejects.toThrow("One or more alert markets are not active project markets.");
    expect(mocks.prisma.alertRule.create).not.toHaveBeenCalled();
  });

  it("quick-creates a default keyword alert rule", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([{ id: "keyword_1" }]);
    mocks.prisma.alertRule.create.mockResolvedValue({
      id: "rule_1",
      name: "Slipped out of top 10",
      publicId: rulePublicId,
      targets: [{ keywordId: "keyword_1" }],
    });

    await createKeywordAlertRule({
      keywordId: keywordPublicId,
      projectId: projectPublicId,
    });

    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conditionType: "exits_top_n",
        enabled: true,
        targetType: "keyword",
        topN: 10,
      }),
      include: {
        markets: { include: { projectMarket: { select: { publicId: true } } } },
        recipients: { select: { userId: true } },
        targets: true,
      },
    });
  });

  it("returns a warning when an alert threshold exceeds a target's tracked depth", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        id: "keyword_1",
        project: { defaults: { serpDepth: 100 } },
        schedule: { serpDepth: 10 },
      },
    ]);
    mocks.prisma.alertRule.create.mockResolvedValue({
      id: "rule_1",
      name: "Top 50",
      publicId: rulePublicId,
    });

    const result = await createAlertRule({
      channels: [],
      conditionType: "threshold",
      name: "Top 50",
      projectId: projectPublicId,
      targetIds: [keywordPublicId],
      targetType: "keyword",
      thresholdPosition: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.warning).toContain("tracked only to top 10");
    expect(result).toMatchObject({ id: rulePublicId });
  });

  it("replaces targets when updating a rule", async () => {
    mocks.prisma.alertRule.findFirst.mockResolvedValue({
      enabled: true,
      id: "rule_1",
      publicId: rulePublicId,
      targets: [{ keywordId: "old_keyword" }],
    });
    mocks.prisma.tag.findMany.mockResolvedValue([{ id: "tag_1" }]);
    mocks.prisma.alertRule.update.mockResolvedValue({
      id: "rule_1",
      publicId: rulePublicId,
      targets: [{ tagId: "tag_1" }],
    });

    await updateAlertRule({
      channels: ["webhook"],
      conditionType: "change_pct",
      changePct: 20,
      name: "Material move",
      projectId: projectPublicId,
      ruleId: rulePublicId,
      targetIds: [tagPublicId],
      targetType: "tag",
    });

    expect(mocks.prisma.alertRuleTarget.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "rule_1" },
    });
    expect(mocks.prisma.alertRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targets: { create: [{ tagId: "tag_1" }] },
        }),
      }),
    );
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "alert_rule.update",
        targetId: rulePublicId,
      }),
      mocks.prisma,
    );
  });

  it("denies rule deletion to viewers", async () => {
    mockActor("viewer");

    await expect(
      deleteAlertRule({ projectId: projectPublicId, ruleId: rulePublicId }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);
    expect(mocks.prisma.alertRule.delete).not.toHaveBeenCalled();
  });

  it("encrypts webhook HMAC secrets before storage", async () => {
    let storedSecret = "";
    mocks.prisma.webhookEndpoint.create.mockImplementation(({ data }) => {
      storedSecret = data.hmacSecret;
      return Promise.resolve({
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        description: null,
        enabled: true,
        id: "webhook_1",
        lastDeliveryAt: null,
        publicId: webhookPublicId,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        url: data.url,
      });
    });

    await expect(
      upsertWebhookEndpoint({
        hmacSecret: "1234567890123456",
        projectId: projectPublicId,
        url: "https://example.com/webhook",
      }),
    ).resolves.toMatchObject({
      id: webhookPublicId,
      ok: true,
    });

    expect(storedSecret).not.toBe("1234567890123456");
    expect(decryptSecret(storedSecret)).toBe("1234567890123456");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "webhook_endpoint.create" }),
      mocks.prisma,
    );
  });

  it("returns the webhook endpoint cap as a handled action result", async () => {
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(10);

    await expect(
      upsertWebhookEndpoint({
        hmacSecret: "1234567890123456",
        projectId: projectPublicId,
        url: "https://example.com/webhook",
      }),
    ).resolves.toEqual({
      error:
        "Webhook endpoint limit reached: a project can have at most 10 webhook endpoints. Delete an existing endpoint before creating another.",
      ok: false,
    });
    expect(mocks.prisma.webhookEndpoint.create).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns invalid webhook URLs as handled action results", async () => {
    await expect(
      upsertWebhookEndpoint({
        hmacSecret: "1234567890123456",
        projectId: projectPublicId,
        url: "not-a-url",
      }),
    ).resolves.toEqual({
      error: "Enter a valid HTTP or HTTPS webhook URL.",
      ok: false,
    });

    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.prisma.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it("returns private-network webhook targets as handled action results", async () => {
    vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_NETWORK", "0");

    await expect(
      upsertWebhookEndpoint({
        hmacSecret: "1234567890123456",
        projectId: projectPublicId,
        url: "http://localhost/webhook",
      }),
    ).resolves.toEqual({ error: PRIVATE_NETWORK_WEBHOOK_ERROR, ok: false });

    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.prisma.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it("rejects a hostname that DNS resolves to a private address before writing", async () => {
    mocks.assertWebhookUrlAllowed.mockRejectedValueOnce(new Error(PRIVATE_NETWORK_WEBHOOK_ERROR));

    await expect(
      upsertWebhookEndpoint({
        hmacSecret: "1234567890123456",
        projectId: projectPublicId,
        url: "https://hooks.example.com/webhook",
      }),
    ).resolves.toEqual({ error: PRIVATE_NETWORK_WEBHOOK_ERROR, ok: false });

    expect(mocks.assertWebhookUrlAllowed).toHaveBeenCalledWith("https://hooks.example.com/webhook");
    expect(mocks.prisma.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it("sends an authorized signed test through the production alert transport", async () => {
    mocks.prisma.webhookEndpoint.findFirst.mockResolvedValue({
      enabled: true,
      hmacSecret: "encrypted-secret",
      id: "webhook_1",
      url: "https://example.com/webhook",
      publicId: webhookPublicId,
    });

    await expect(
      testWebhookEndpoint({
        endpointId: webhookPublicId,
        projectId: projectPublicId,
      }),
    ).resolves.toEqual({ latencyMs: 12, ok: true, status: 204 });
    expect(mocks.postSignedWebhookTest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "webhook_1",
        publicId: webhookPublicId,
      }),
      {
        projectDomain: "example.com",
        projectId: projectPublicId,
        webhookId: webhookPublicId,
      },
    );
  });

  it("returns HTTP status, latency, and reason for a failed test", async () => {
    mocks.prisma.webhookEndpoint.findFirst.mockResolvedValue({
      enabled: true,
      hmacSecret: "encrypted-secret",
      id: "webhook_1",
      url: "https://example.com/webhook",
      publicId: webhookPublicId,
    });
    mocks.postSignedWebhookTest.mockRejectedValueOnce(
      new mocks.DeliveryHttpError("Webhook delivery failed with status 500.", 500, null, 19),
    );

    await expect(
      testWebhookEndpoint({
        endpointId: webhookPublicId,
        projectId: projectPublicId,
      }),
    ).resolves.toEqual({
      error: "Webhook delivery failed with status 500.",
      latencyMs: 19,
      ok: false,
      status: 500,
    });
  });

  it("denies endpoint tests to viewers", async () => {
    mockActor("viewer");

    await expect(
      testWebhookEndpoint({
        endpointId: webhookPublicId,
        projectId: projectPublicId,
      }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);
    expect(mocks.postSignedWebhookTest).not.toHaveBeenCalled();
  });

  it("deletes an endpoint within the managed project scope", async () => {
    mocks.prisma.webhookEndpoint.findFirst.mockResolvedValue({
      createdAt: new Date(),
      description: null,
      enabled: true,
      id: "webhook_1",
      lastDeliveryAt: null,
      publicId: webhookPublicId,
      updatedAt: new Date(),
      url: "https://example.com/webhook",
    });
    mocks.prisma.webhookEndpoint.delete.mockResolvedValue({ id: "webhook_1" });

    await expect(
      deleteWebhookEndpoint({ endpointId: webhookPublicId, projectId: projectPublicId }),
    ).resolves.toEqual({ id: webhookPublicId, ok: true });
    expect(mocks.prisma.webhookEndpoint.delete).toHaveBeenCalledWith({
      where: { id: "webhook_1" },
    });
  });

  it("denies endpoint deletion to viewers", async () => {
    mockActor("viewer");

    await expect(
      deleteWebhookEndpoint({ endpointId: webhookPublicId, projectId: projectPublicId }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);
    expect(mocks.prisma.webhookEndpoint.delete).not.toHaveBeenCalled();
  });
});
