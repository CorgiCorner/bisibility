import "server-only";

import { isDeepStrictEqual } from "node:util";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { normalizeProjectSavedView } from "@/lib/saved-views/model";
import { DEFAULT_SERP_DEVICE, DEFAULT_SERP_MARKET } from "@/lib/serp/markets";
import type { KeywordMaps } from "./importers";
import { keywordKey } from "./importers";
import type { Project, VerifiedMigrationToken } from "./jobs";
import type { CloudImportBody, ImportAlertRule, ImportNotificationPreference } from "./schemas";

type TargetCreate = { keywordId?: string; tagId?: string };

export async function importCompetitors(
  projectId: string,
  competitors: CloudImportBody["competitors"],
  client: Prisma.TransactionClient,
) {
  const unique = [...new Map(competitors.map((item) => [item.domain, item])).values()];
  const existing = await client.competitor.findMany({
    select: { domain: true, label: true },
    where: { domain: { in: unique.map((item) => item.domain) }, projectId },
  });
  const existingLabels = new Map(existing.map((item) => [item.domain, item.label]));
  let imported = 0;
  let skipped = 0;
  for (const competitor of unique) {
    if (
      existingLabels.has(competitor.domain) &&
      existingLabels.get(competitor.domain) === competitor.label
    ) {
      skipped += 1;
      continue;
    }
    await client.competitor.upsert({
      create: {
        domain: competitor.domain,
        label: competitor.label,
        projectId,
        publicId: makePublicId("cmp"),
      },
      update: { label: competitor.label },
      where: { projectId_domain: { domain: competitor.domain, projectId } },
    });
    imported += 1;
  }
  return { imported, skipped };
}

export async function importSavedViews(
  projectId: string,
  savedViews: CloudImportBody["savedViews"],
  client: Prisma.TransactionClient,
) {
  let imported = 0;
  let skipped = 0;
  for (const view of savedViews) {
    const normalized = normalizeProjectSavedView(view.config, view.surface);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    const existing = await client.savedView.findFirst({
      select: { config: true, id: true },
      where: { name: view.name, projectId, surface: normalized.surface },
    });
    const config = normalized.config as Prisma.InputJsonValue;
    if (existing) {
      if (isDeepStrictEqual(existing.config, config)) {
        skipped += 1;
        continue;
      }
      await client.savedView.update({
        data: { config, surface: normalized.surface },
        where: { id: existing.id },
      });
    } else {
      await client.savedView.create({
        data: {
          config,
          name: view.name,
          projectId,
          publicId: makePublicId("viw"),
          surface: normalized.surface,
        },
      });
    }
    imported += 1;
  }
  return { imported, skipped };
}

function alertData(rule: ImportAlertRule) {
  return {
    changePct: rule.changePct,
    channels: rule.channels,
    competitorDomain: rule.competitorDomain,
    conditionType: rule.conditionType,
    dropPositions: rule.dropPositions,
    enabled: rule.enabled,
    name: rule.name,
    serpFeature: rule.serpFeature,
    severity: rule.severity,
    targetType: rule.targetType,
    thresholdPosition: rule.thresholdPosition,
    topN: rule.topN,
  };
}

function alertIdentity(rule: ImportAlertRule) {
  return {
    changePct: rule.changePct,
    competitorDomain: rule.competitorDomain,
    conditionType: rule.conditionType,
    dropPositions: rule.dropPositions,
    name: rule.name,
    serpFeature: rule.serpFeature,
    severity: rule.severity,
    targetType: rule.targetType,
    thresholdPosition: rule.thresholdPosition,
    topN: rule.topN,
  };
}

async function tagIds(
  projectId: string,
  rules: ImportAlertRule[],
  client: Prisma.TransactionClient,
) {
  const names = [
    ...new Set(
      rules
        .flatMap((rule) => rule.targets.map((target) => target.tag))
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  if (names.length === 0) return new Map<string, string>();
  const rows = await client.tag.findMany({
    select: { id: true, name: true },
    where: { name: { in: names }, projectId },
  });
  return new Map(rows.map((row) => [row.name, row.id]));
}

function alertTargets(rule: ImportAlertRule, keywords: KeywordMaps, tags: Map<string, string>) {
  const targets: TargetCreate[] = [];
  for (const target of rule.targets) {
    if (target.type === "tag") {
      const tagId = target.tag ? tags.get(target.tag) : null;
      if (tagId) targets.push({ tagId });
      continue;
    }
    const natural = target.keyword
      ? keywords.byKey.get(
          keywordKey({
            device: target.device ?? DEFAULT_SERP_DEVICE,
            keyword: target.keyword,
            location: target.location ?? DEFAULT_SERP_MARKET,
          }),
        )
      : null;
    const keywordId = (target.keywordId && keywords.bySource.get(target.keywordId)) ?? natural;
    if (keywordId) targets.push({ keywordId });
  }
  return targets;
}

async function writeRuleTargets(
  ruleId: string,
  targets: TargetCreate[],
  client: Prisma.TransactionClient,
) {
  await client.alertRuleTarget.deleteMany({ where: { ruleId } });
  if (targets.length > 0) {
    await client.alertRuleTarget.createMany({
      data: targets.map((target) => ({ ...target, ruleId })),
    });
  }
}

export async function importAlertRules(
  projectId: string,
  rules: ImportAlertRule[],
  keywords: KeywordMaps,
  client: Prisma.TransactionClient,
) {
  const tags = await tagIds(projectId, rules, client);
  let imported = 0;
  let skipped = 0;
  for (const rule of rules) {
    const targets = alertTargets(rule, keywords, tags);
    if (rule.targetType !== "all" && targets.length === 0) {
      skipped += 1;
      continue;
    }

    const existing = await client.alertRule.findFirst({
      select: {
        channels: true,
        enabled: true,
        id: true,
        targets: { select: { keywordId: true, tagId: true } },
      },
      where: { ...alertIdentity(rule), projectId },
    });
    const targetKey = (target: { keywordId?: string | null; tagId?: string | null }) =>
      `${target.keywordId ?? ""}\0${target.tagId ?? ""}`;
    const unchanged =
      existing &&
      existing.enabled === rule.enabled &&
      [...existing.channels].sort().join("\0") === [...rule.channels].sort().join("\0") &&
      existing.targets.map(targetKey).sort().join("\0") ===
        targets.map(targetKey).sort().join("\0");
    if (unchanged) {
      skipped += 1;
      continue;
    }
    const row =
      existing ??
      (await client.alertRule.create({
        data: { ...alertData(rule), projectId, publicId: makePublicId("alr") },
        select: { id: true },
      }));
    if (existing) {
      await client.alertRule.update({ data: alertData(rule), where: { id: existing.id } });
    }
    await writeRuleTargets(row.id, targets, client);
    imported += 1;
  }
  return { imported, skipped };
}

async function upsertPreference(
  project: Project,
  token: VerifiedMigrationToken,
  preference: ImportNotificationPreference,
  client: Prisma.TransactionClient,
) {
  const userId = token.createdById ?? project.ownerId;
  const existing = await client.notificationPreference.findUnique({
    select: {
      alertEmail: true,
      alertInApp: true,
      checkEmail: true,
      checkInApp: true,
      importEmail: true,
      importInApp: true,
      inviteEmail: true,
      inviteInApp: true,
      reportEmail: true,
    },
    where: { userId_projectId: { projectId: project.id, userId } },
  });
  if (
    existing &&
    Object.entries(preference).every(
      ([key, value]) => existing[key as keyof typeof existing] === value,
    )
  ) {
    return false;
  }
  await client.notificationPreference.upsert({
    create: { ...preference, projectId: project.id, userId },
    update: preference,
    where: { userId_projectId: { projectId: project.id, userId } },
  });
  return true;
}

export async function importNotificationPreferences(
  project: Project,
  token: VerifiedMigrationToken,
  preferences: ImportNotificationPreference[],
  client: Prisma.TransactionClient,
) {
  let imported = 0;
  let skipped = 0;
  for (const [index, preference] of preferences.entries()) {
    if (index === 0) {
      if (await upsertPreference(project, token, preference, client)) imported += 1;
      else skipped += 1;
    } else {
      skipped += 1;
    }
  }
  return { imported, skipped };
}
