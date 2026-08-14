import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAlertRuleRecord,
  deleteAlertRuleRecord,
  updateAlertRuleRecord,
} from "./alert-service";

const mocks = vi.hoisted(() => {
  const tx = {
    alertRule: { update: vi.fn() },
    alertRuleMarket: { deleteMany: vi.fn() },
    alertRuleRecipient: { deleteMany: vi.fn() },
    alertRuleTarget: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(),
    alertRule: { count: vi.fn(), create: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    alertRuleTarget: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    keyword: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    tag: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  };

  return { prisma, tx, writeAudit: vi.fn() };
});

vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const context = { actorId: null, projectId: "project_1" };
const ruleInclude = {
  markets: { include: { projectMarket: { select: { publicId: true } } } },
  recipients: { select: { userId: true } },
  targets: true,
};

function form(overrides: Record<string, unknown> = {}) {
  return {
    channels: [],
    conditionType: "threshold",
    enabled: true,
    marketIds: [],
    name: "Rank drop",
    projectId: "prj_a00000000000000000000000",
    targetIds: [],
    targetType: "all",
    thresholdPosition: 10,
    ...overrides,
  } as Parameters<typeof createAlertRuleRecord>[0];
}

function rule(overrides: Record<string, unknown> = {}) {
  return {
    channels: [],
    conditionType: "threshold",
    enabled: true,
    id: "rule_1",
    name: "Rank drop",
    publicId: "alr_a00000000000000000000000",
    projectId: "project_1",
    severity: "urgent",
    targets: [],
    thresholdPosition: 10,
    ...overrides,
  };
}

describe("alert service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.prisma.alertRule.create.mockResolvedValue(rule());
    mocks.prisma.alertRule.count.mockResolvedValue(0);
    mocks.prisma.alertRule.delete.mockResolvedValue(rule());
    mocks.prisma.alertRule.findFirst.mockResolvedValue(rule());
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);
    mocks.prisma.project.findUnique.mockResolvedValue({ ownerId: "owner_1" });
    mocks.prisma.tag.findMany.mockResolvedValue([]);
    mocks.prisma.user.findMany.mockImplementation(({ where }) => {
      const rawIds: string[] =
        where.OR.find((clause: { id?: { in: string[] } }) => clause.id)?.id?.in ?? [];
      return Promise.resolve(rawIds.map((id) => ({ id })));
    });
    mocks.tx.alertRule.update.mockResolvedValue(rule({ name: "Updated" }));
    mocks.writeAudit.mockResolvedValue({});
  });

  it("creates API-owned rules with a null creator and audit actor", async () => {
    await createAlertRuleRecord(form(), context);

    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdById: null, projectId: "project_1" }),
      include: ruleInclude,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "alert_rule.create", actorId: null }),
    );
  });

  it("derives a create default but accepts an explicit severity", async () => {
    await createAlertRuleRecord(form(), context);
    expect(mocks.prisma.alertRule.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: "urgent" }) }),
    );

    await createAlertRuleRecord(form({ severity: "info" }), context);
    expect(mocks.prisma.alertRule.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: "info" }) }),
    );
  });

  it("defaults API-created email rules to the project owner", async () => {
    await createAlertRuleRecord(form({ channels: ["email"] }), context);

    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith({
      select: { ownerId: true },
      where: { id: "project_1" },
    });
    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: null,
        recipients: { create: [{ userId: "owner_1" }] },
      }),
      include: ruleInclude,
    });
  });

  it("respects an explicit empty recipient set on create", async () => {
    await createAlertRuleRecord(form({ channels: ["email"], recipientIds: [] }), context);

    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ recipients: expect.anything() }),
      include: ruleInclude,
    });
  });

  it("fails when an omitted email recipient cannot fall back to a project owner", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(null);

    await expect(createAlertRuleRecord(form({ channels: ["email"] }), context)).rejects.toThrow(
      "Project owner could not be resolved for email alert recipients.",
    );
    expect(mocks.prisma.alertRule.create).not.toHaveBeenCalled();
  });

  it("rejects a fallback owner who is not a project member", async () => {
    mocks.prisma.user.findMany.mockResolvedValue([]);

    await expect(createAlertRuleRecord(form({ channels: ["email"] }), context)).rejects.toThrow(
      "One or more recipients are not project members.",
    );
    expect(mocks.prisma.alertRule.create).not.toHaveBeenCalled();
  });

  it("passes through human actors on create", async () => {
    await createAlertRuleRecord(form(), { actorId: "user_1", projectId: "project_1" });

    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: "user_1",
        recipients: { create: [{ userId: "user_1" }] },
      }),
      include: ruleInclude,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "alert_rule.create", actorId: "user_1" }),
    );
  });

  it("rejects recipients who are not project members", async () => {
    mocks.prisma.user.findMany.mockResolvedValue([]);
    await expect(
      createAlertRuleRecord(form({ recipientIds: ["outside_user"] }), {
        actorId: "user_1",
        projectId: "project_1",
      }),
    ).rejects.toThrow("One or more recipients are not project members.");
  });

  it("counts paused rules toward the project cap and gives truthful guidance", async () => {
    mocks.prisma.alertRule.count.mockResolvedValue(50);

    await expect(createAlertRuleRecord(form(), context)).rejects.toThrow(
      "Alert rule limit reached: a project can have at most 50 alert rules. Delete an existing rule before creating another.",
    );

    expect(mocks.prisma.alertRule.count).toHaveBeenCalledWith({
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.alertRule.create).not.toHaveBeenCalled();
  });

  it("allows rule creation below the project cap", async () => {
    mocks.prisma.alertRule.count.mockResolvedValue(49);

    await expect(createAlertRuleRecord(form(), context)).resolves.toMatchObject({ id: "rule_1" });

    expect(mocks.prisma.alertRule.create).toHaveBeenCalledOnce();
  });

  it("requires keyword targets to belong to the context project", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([{ id: "keyword_1" }]);

    await expect(
      createAlertRuleRecord(
        form({
          targetIds: ["kw_a00000000000000000000000", "kw_b00000000000000000000000"],
          targetType: "keyword",
          topN: 10,
        }),
        context,
      ),
    ).rejects.toThrow("One or more keyword targets were not found.");
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        OR: [
          { id: { in: ["kw_a00000000000000000000000", "kw_b00000000000000000000000"] } },
          { publicId: { in: ["kw_a00000000000000000000000", "kw_b00000000000000000000000"] } },
        ],
        projectId: "project_1",
      },
    });
    expect(mocks.prisma.alertRule.create).not.toHaveBeenCalled();
  });

  it("updates rules in one transaction and audits through the tx client", async () => {
    const result = await updateAlertRuleRecord(form({ name: "Updated", ruleId: "rule_1" }), {
      actorId: "user_1",
      projectId: "project_1",
    });

    expect(result).toMatchObject({ id: "rule_1", name: "Updated" });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.alertRuleTarget.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "rule_1" },
    });
    expect(mocks.tx.alertRuleMarket.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "rule_1" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "alert_rule.update", actorId: "user_1" }),
      mocks.tx,
    );
  });

  it("preserves market scope when an old PATCH client omits market ids", async () => {
    const { marketIds: _marketIds, ...data } = form({ ruleId: "rule_1" });

    await updateAlertRuleRecord(data, context);

    expect(mocks.prisma.projectMarket.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.alertRuleMarket.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.alertRule.update.mock.calls[0]?.[0].data.markets).toBeUndefined();
  });

  it("clears market scope when PATCH provides an explicit empty set", async () => {
    await updateAlertRuleRecord(form({ marketIds: [], ruleId: "rule_1" }), context);

    expect(mocks.prisma.projectMarket.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.alertRuleMarket.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "rule_1" },
    });
    expect(mocks.tx.alertRule.update.mock.calls[0]?.[0].data.markets).toBeUndefined();
  });

  it("preserves severity on omitted updates and applies explicit overrides", async () => {
    await updateAlertRuleRecord(form({ ruleId: "rule_1" }), context);
    expect(mocks.tx.alertRule.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: "urgent" }) }),
    );

    await updateAlertRuleRecord(form({ ruleId: "rule_1", severity: "warning" }), context);
    expect(mocks.tx.alertRule.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: "warning" }) }),
    );
  });

  it("replaces a non-empty recipient set inside the transaction", async () => {
    await updateAlertRuleRecord(form({ recipientIds: ["user_2"], ruleId: "rule_1" }), {
      actorId: "user_1",
      projectId: "project_1",
    });
    expect(mocks.tx.alertRuleRecipient.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "rule_1" },
    });
    expect(mocks.tx.alertRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipients: { create: [{ userId: "user_2" }] } }),
      }),
    );
  });

  it("clears recipients when an explicit empty set is provided", async () => {
    await updateAlertRuleRecord(form({ recipientIds: [], ruleId: "rule_1" }), {
      actorId: "user_1",
      projectId: "project_1",
    });

    expect(mocks.tx.alertRuleRecipient.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "rule_1" },
    });
    expect(mocks.tx.alertRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ recipients: expect.anything() }),
      }),
    );
  });

  it("preserves recipients when recipient ids are omitted", async () => {
    await updateAlertRuleRecord(form({ ruleId: "rule_1" }), {
      actorId: "user_1",
      projectId: "project_1",
    });

    expect(mocks.tx.alertRuleRecipient.deleteMany).not.toHaveBeenCalled();
  });

  it("requires a rule id when updating", async () => {
    await expect(updateAlertRuleRecord(form(), context)).rejects.toThrow(
      "Alert rule id is required.",
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("deletes rules and audits the before image", async () => {
    const result = await deleteAlertRuleRecord({ ruleId: "rule_1" }, context);

    expect(result).toEqual({ deleted: true });
    expect(mocks.prisma.alertRule.delete).toHaveBeenCalledWith({ where: { id: "rule_1" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "alert_rule.delete",
        actorId: null,
        before: expect.objectContaining({ id: "alr_a00000000000000000000000" }),
      }),
    );
  });

  it("rejects unknown rules on delete", async () => {
    mocks.prisma.alertRule.findFirst.mockResolvedValue(null);

    await expect(deleteAlertRuleRecord({ ruleId: "missing" }, context)).rejects.toThrow(
      "Alert rule not found.",
    );
    expect(mocks.prisma.alertRule.delete).not.toHaveBeenCalled();
  });
});
