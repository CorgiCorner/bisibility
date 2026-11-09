import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import { createRecipientIds, recipientCreates } from "./alert-recipients";
import "server-only";

import { MAX_ALERT_RULES_PER_PROJECT } from "@/lib/alerts/limits";
import type { AlertRuleForm, AlertRuleUpdateForm } from "@/lib/alerts/schema";
import { type AlertSeverity, defaultAlertSeverity } from "@/lib/alerts/severity";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, makePublicId } from "@/lib/db/public-id";
import { type AlertConditionType, Prisma } from "@/lib/generated/prisma/client";
import { alertRuleAuditResource } from "./audit-resources";
import { ApiConflictError } from "./errors";
import { requireApiPublicId } from "./public-id";

export type AlertMutationContext = { actorId: string | null; projectId: string };

const ruleInclude = {
  markets: { include: { projectMarket: { select: { publicId: true } } } },
  recipients: { select: { userId: true } },
  targets: {
    include: { keyword: { select: { publicId: true } }, tag: { select: { publicId: true } } },
  },
} as const;

type TargetCreate = { keywordId?: string; tagId?: string };

type MarketCreate = { projectMarketId: string };

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function prismaConditionType(conditionType: AlertRuleForm["conditionType"]): AlertConditionType {
  return conditionType;
}

async function targetCreates(projectId: string, targetType: string, rawIds: string[]) {
  if (targetType === "all") {
    return [];
  }

  const ids = uniqueIds(rawIds);
  if (targetType === "keyword") {
    const keywords = await prisma.keyword.findMany({
      select: { id: true },
      where: { OR: [{ id: { in: ids } }, { publicId: { in: ids } }], projectId },
    });
    if (keywords.length !== ids.length) {
      throw new Error("One or more keyword targets were not found.");
    }
    return keywords.map((keyword) => ({ keywordId: keyword.id }));
  }

  if (targetType === "tag") {
    const tags = await prisma.tag.findMany({
      select: { id: true },
      where: { OR: [{ id: { in: ids } }, { publicId: { in: ids } }], projectId },
    });
    if (tags.length !== ids.length) {
      throw new Error("One or more tag targets were not found.");
    }
    return tags.map((tag) => ({ tagId: tag.id }));
  }

  return [];
}

async function marketCreates(projectId: string, rawIds: string[]): Promise<MarketCreate[]> {
  const ids = uniqueIds(rawIds);
  if (ids.length === 0) return [];
  const markets = await prisma.projectMarket.findMany({
    select: { id: true },
    where: {
      OR: [{ id: { in: ids } }, { publicId: { in: ids } }],
      projectId,
      status: "active",
    },
  });
  if (markets.length !== ids.length) {
    throw new Error("One or more alert markets are not active project markets.");
  }
  return markets.map(({ id }) => ({ projectMarketId: id }));
}

function ruleData(
  data: AlertRuleUpdateForm,
  targets: TargetCreate[],
  markets: MarketCreate[],
  severity: AlertSeverity,
) {
  return {
    channels: data.channels,
    changePct: data.changePct ?? null,
    competitorDomain: data.competitorDomain ?? null,
    conditionType: prismaConditionType(data.conditionType),
    dropPositions: data.dropPositions ?? null,
    enabled: data.enabled,
    markets: markets.length ? { create: markets } : undefined,
    name: data.name,
    serpFeature: data.serpFeature ?? null,
    severity,
    targetType: data.targetType,
    targets: targets.length ? { create: targets } : undefined,
    thresholdPosition: data.thresholdPosition ?? null,
    topN: data.topN ?? null,
  };
}

export async function requireAlertRule(projectId: string, ruleId: string) {
  const rule = await prisma.alertRule.findFirst({
    include: ruleInclude,
    where: isPublicIdOfType(ruleId, "alr")
      ? { projectId, publicId: ruleId }
      : { id: ruleId, projectId },
  });
  if (!rule) {
    throw new Error("Alert rule not found.");
  }
  return rule;
}

export async function createAlertRuleRecord(
  data: AlertRuleForm & { requestId?: string },
  context: AlertMutationContext,
) {
  const existing = async () => {
    if (!data.requestId || !context.actorId) return null;
    return prisma.alertRule.findFirst({
      where: {
        publicId: data.requestId,
        projectId: context.projectId,
        createdById: context.actorId,
      },
      include: ruleInclude,
    });
  };
  const prior = await existing();
  if (prior) return { ...prior, replayed: true as const };
  const targets = await targetCreates(context.projectId, data.targetType, data.targetIds);
  const markets = await marketCreates(context.projectId, data.marketIds ?? []);
  const requestedRecipients = await createRecipientIds(data, context);
  const recipients = await recipientCreates(context.projectId, requestedRecipients);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const capacity = await prepareResourceCapacity(tx, {
          projectId: context.projectId,
          dimensions: ["alertRulesAndWebhooks"],
        });
        const lockKey = `alert-rule-capacity:${context.projectId}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const count = await tx.alertRule.count({ where: { projectId: context.projectId } });
        if (count >= MAX_ALERT_RULES_PER_PROJECT) {
          throw new ApiConflictError(
            `Alert rule limit reached: a project can have at most ${MAX_ALERT_RULES_PER_PROJECT} alert rules. Delete an existing rule before creating another.`,
          );
        }
        const rule = await tx.alertRule.create({
          data: {
            ...ruleData(
              data,
              targets,
              markets,
              data.severity ?? defaultAlertSeverity(data.conditionType),
            ),
            createdById: context.actorId,
            publicId: data.requestId ?? makePublicId("alr"),
            projectId: context.projectId,
            recipients: recipients.length ? { create: recipients } : undefined,
          },
          include: ruleInclude,
        });
        await writeAudit(
          {
            action: "alert_rule.create",
            actorId: context.actorId,
            after: alertRuleAuditResource(rule),
            projectId: context.projectId,
            targetId: requireApiPublicId(rule.publicId ?? "", "alr"),
            targetType: "alert_rule",
          },
          tx,
        );
        await capacity.check();
        return rule;
      },
      { timeout: 20_000 },
    );
  } catch (error) {
    if (
      error instanceof ApiConflictError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      const rule = await existing();
      if (rule) return { ...rule, replayed: true as const };
    }
    throw error;
  }
}

export async function updateAlertRuleRecord(
  data: AlertRuleUpdateForm,
  context: AlertMutationContext,
) {
  if (!data.ruleId) {
    throw new Error("Alert rule id is required.");
  }

  const before = await requireAlertRule(context.projectId, data.ruleId);
  const targets = await targetCreates(context.projectId, data.targetType, data.targetIds);
  const replacesMarkets = data.marketIds !== undefined;
  const markets = replacesMarkets
    ? await marketCreates(context.projectId, data.marketIds ?? [])
    : [];
  const replacesRecipients = data.recipientIds !== undefined;
  const recipients = replacesRecipients
    ? await recipientCreates(context.projectId, data.recipientIds ?? [])
    : [];
  return prisma.$transaction(async (tx) => {
    const admission = await prepareResourceCapacity(tx, {
      projectId: context.projectId,
      dimensions: [],
    });
    const current = admission.enabled
      ? await tx.alertRule.findUniqueOrThrow({ where: { id: before.id } })
      : before;
    const capacity = await prepareResourceCapacity(tx, {
      projectId: context.projectId,
      dimensions: ["alertRulesAndWebhooks"],
      activating: data.enabled === true && !current.enabled,
    });
    if (replacesMarkets) {
      await tx.alertRuleMarket.deleteMany({ where: { ruleId: before.id } });
    }
    await tx.alertRuleTarget.deleteMany({ where: { ruleId: before.id } });
    if (replacesRecipients) {
      await tx.alertRuleRecipient.deleteMany({ where: { ruleId: before.id } });
    }
    const updated = await tx.alertRule.update({
      data: {
        ...ruleData(data, targets, markets, data.severity ?? before.severity),
        recipients: recipients.length ? { create: recipients } : undefined,
      },
      include: ruleInclude,
      where: { id: before.id },
    });
    await writeAudit(
      {
        action: "alert_rule.update",
        actorId: context.actorId,
        after: alertRuleAuditResource(updated),
        before: alertRuleAuditResource(before),
        projectId: context.projectId,
        targetId: requireApiPublicId(updated.publicId ?? "", "alr"),
        targetType: "alert_rule",
      },
      tx,
    );
    await capacity.check();
    return updated;
  });
}

export async function deleteAlertRuleRecord(
  { ruleId }: { ruleId: string },
  context: AlertMutationContext,
) {
  const before = await requireAlertRule(context.projectId, ruleId);
  await prisma.$transaction(async (tx) => {
    await tx.alertRule.delete({ where: { id: before.id } });
    await writeAudit(
      {
        action: "alert_rule.delete",
        actorId: context.actorId,
        before: alertRuleAuditResource(before),
        projectId: context.projectId,
        targetId: requireApiPublicId(before.publicId ?? "", "alr"),
        targetType: "alert_rule",
      },
      tx,
    );
  });

  return { deleted: true };
}
