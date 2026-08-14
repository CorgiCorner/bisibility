import "server-only";

import { prisma } from "@/lib/db/prisma";
import { normalizeDomain } from "@/lib/domains/normalize";
import type { AlertRule } from "@/lib/generated/prisma/client";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { type CtrDropMetrics, hasCtrDrop, loadGscCtrMetrics } from "./ctr-drop";
import { alertDepthConflict } from "./depth-conflict";
import { emitDepthConflictSignal } from "./depth-conflict-signal";
import { type AlertTrendCheck, downtrendSummary, hasDowntrend } from "./downtrend";
import { loadRecentCompletedChecks } from "./history";
import { alertMarketMatches } from "./market-scope";
import { hasPositionDrop } from "./position-drop";
import { alertPayload } from "./presentation";
import type { AlertConditionTypeInput } from "./schema";
import { activeAlertSnoozeWhere } from "./snooze";
import {
  hasOpenTriggeredAlert,
  isStatefulAlertCondition,
  resolveClearedTriggeredAlerts,
  statefulStateKnown,
} from "./transitions";
import { type AlertDeliveryMode, persistAndDeliverTriggeredAlert } from "./trigger-delivery";
import { hasUrlMismatch } from "./url-mismatch";

export type AlertRankSnapshot = {
  checkedAt?: Date;
  competitorsAbove?: string[];
  ctrDropMetrics?: CtrDropMetrics | null;
  normalizationVersion?: string | null;
  position: number | null;
  rankCheckId?: string | null;
  raw?: unknown;
  rankingUrl?: string | null;
  recentChecks?: AlertTrendCheck[];
  requestedDepth?: number | null;
  serpFeatures?: string[];
  targetUrl?: string | null;
};

export type AlertConditionRule = Pick<
  AlertRule,
  "changePct" | "competitorDomain" | "dropPositions" | "serpFeature" | "thresholdPosition" | "topN"
> & { conditionType: AlertConditionTypeInput };

function numberValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[_-]+/g, " ") ?? "";
}

function includesNormalized(values: string[] | undefined, expected: string | null | undefined) {
  const target = normalized(expected);
  return Boolean(target) && (values ?? []).some((value) => normalized(value) === target);
}

// biome-ignore format: compact helper keeps this module under the line cap.
function rawRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null; }

// biome-ignore format: compact helper keeps this module under the line cap.
function rawStringArray(raw: Record<string, unknown>, keys: string[]) { for (const key of keys) { const value = raw[key]; if (Array.isArray(value)) { return value.filter((item): item is string => typeof item === "string"); } } return null; }

// biome-ignore format: compact helper keeps this module under the line cap.
function arrayValue(value: unknown) { return Array.isArray(value) ? value : []; }

// biome-ignore format: compact helper keeps this module under the line cap.
function domainFromItem(item: Record<string, unknown>) { for (const key of ["domain", "url", "link", "displayed_link", "source"]) { const value = item[key]; if (typeof value === "string") { const domain = normalizeDomain(value); if (domain) return domain; } } return null; }

// biome-ignore format: compact helper keeps this module under the line cap.
function rankFromItem(item: Record<string, unknown>) { for (const key of ["rank", "position", "rank_group", "rank_absolute"]) { const rank = numberValue(item[key]); if (rank && rank > 0) { return rank; } } return null; }

// biome-ignore format: compact helper keeps this module under the line cap.
function competitorsAboveFromRaw(raw: Record<string, unknown>, ownDomain: string, ownPosition: number | null) { const own = normalizeDomain(ownDomain); const limit = ownPosition ?? Number.POSITIVE_INFINITY; const domains = new Set<string>(); for (const item of [...arrayValue(raw.organic_results), ...arrayValue(raw.organicResults)]) { const record = rawRecord(item); const domain = record ? domainFromItem(record) : null; const rank = record ? rankFromItem(record) : null; if (domain && domain !== own && rank && rank < limit) { domains.add(domain); } } return [...domains]; }

// biome-ignore format: compact helper keeps this module under the line cap.
function hydrateSnapshot(snapshot: AlertRankSnapshot, ownDomain: string) { const raw = rawRecord(snapshot.raw); if (!raw) { return snapshot; } const competitorsAbove = snapshot.competitorsAbove ?? rawStringArray(raw, ["competitors_above", "competitorsAbove"]) ?? competitorsAboveFromRaw(raw, ownDomain, snapshot.position); const serpFeatures = snapshot.serpFeatures ?? rawStringArray(raw, ["serp_features", "serpFeatures", "features"]) ?? []; return { ...snapshot, competitorsAbove, serpFeatures }; }

function crossedWorseThan(before: number | null, after: number | null, threshold: number) {
  return after !== null && after > threshold && (before === null || before <= threshold);
}

function changedByPercent(before: number | null, after: number | null, threshold: number) {
  if (!before || !after) {
    return false;
  }
  return Math.abs(((after - before) / before) * 100) >= threshold;
}

type ConditionMatcher = (
  rule: AlertConditionRule,
  before: AlertRankSnapshot,
  after: AlertRankSnapshot,
) => boolean;

const conditionMatchers: Partial<Record<AlertConditionRule["conditionType"], ConditionMatcher>> = {
  change_pct: (rule, before, after) => {
    const changePct = numberValue(rule.changePct);
    return changePct ? changedByPercent(before.position, after.position, changePct) : false;
  },
  competitor_overtake: (rule, before, after) =>
    includesNormalized(after.competitorsAbove, rule.competitorDomain) &&
    !includesNormalized(before.competitorsAbove, rule.competitorDomain),
  ctr_drop: (rule, _before, after) => hasCtrDrop(after.ctrDropMetrics, rule.changePct),
  downtrend: (_rule, _before, after) => hasDowntrend(after.recentChecks),
  enters_top_n: (rule, before, after) =>
    Boolean(
      rule.topN &&
        after.position !== null &&
        after.position <= rule.topN &&
        (!before.position || before.position > rule.topN),
    ),
  exits_top_n: (rule, before, after) =>
    Boolean(
      rule.topN &&
        before.position !== null &&
        before.position <= rule.topN &&
        (!after.position || after.position > rule.topN),
    ),
  position_drop: (rule, before, after) =>
    hasPositionDrop(before.position, after.position, rule.dropPositions),
  serp_feature: (rule, before, after) =>
    includesNormalized(after.serpFeatures, rule.serpFeature) &&
    !includesNormalized(before.serpFeatures, rule.serpFeature),
  threshold: (rule, before, after) =>
    rule.thresholdPosition
      ? crossedWorseThan(before.position, after.position, rule.thresholdPosition)
      : false,
  url_mismatch: (_rule, _before, after) => hasUrlMismatch(after),
};

export function matchesAlertCondition(
  rule: AlertConditionRule,
  before: AlertRankSnapshot,
  after: AlertRankSnapshot,
) {
  const matcher = conditionMatchers[rule.conditionType];
  if (matcher) return matcher(rule, before, after);

  return false;
}

type AlertTargetRule = {
  targetType: string;
  targets: { keywordId: string | null; tagId: string | null }[];
};

// biome-ignore format: compact helper keeps this module under the line cap.
function targetMatches(rule: AlertTargetRule, keywordId: string, tagIds: Set<string>) { if (rule.targetType === "all") { return true; } if (rule.targetType === "keyword") { return rule.targets.some((target) => target.keywordId === keywordId); } if (rule.targetType === "tag") { return rule.targets.some((target) => target.tagId && tagIds.has(target.tagId)); } return false; }

export async function evaluateKeywordAlerts(
  keywordId: string,
  before: AlertRankSnapshot,
  after: AlertRankSnapshot,
  options: { comparisonAllowed?: boolean; deliveryMode?: AlertDeliveryMode } = {},
) {
  const comparisonAllowed = options.comparisonAllowed ?? true;
  const deliveryMode = options.deliveryMode ?? "immediate";
  const keyword = await prisma.keyword.findUnique({
    select: {
      id: true,
      locationId: true,
      project: {
        select: {
          domain: true,
          id: true,
        },
      },
      projectId: true,
      publicId: true,
      targetUrl: true,
      tags: { select: { tagId: true } },
      text: true,
    },
    where: { id: keywordId },
  });

  if (!keyword) {
    return [];
  }

  const tagIds = new Set(keyword.tags.map((tag) => tag.tagId));
  const projectDomain = trackedProjectDomain(keyword.project.domain) ?? "";
  const beforeSnapshot = hydrateSnapshot(before, projectDomain);
  const afterSnapshot = {
    ...hydrateSnapshot(after, projectDomain),
    targetUrl: keyword.targetUrl,
  };
  const rules = await prisma.alertRule.findMany({
    include: {
      markets: {
        select: {
          projectMarket: { select: { locationId: true, status: true } },
        },
      },
      targets: { select: { keywordId: true, tagId: true } },
    },
    where: { enabled: true, projectId: keyword.projectId },
  });
  const targetRules = rules.filter(
    (rule) =>
      targetMatches(rule, keyword.id, tagIds) && alertMarketMatches(rule, keyword.locationId),
  );
  const currentCheck = {
    checkedAt: afterSnapshot.checkedAt,
    normalizationVersion: afterSnapshot.normalizationVersion,
    position: afterSnapshot.position,
    rankCheckId: afterSnapshot.rankCheckId,
    requestedDepth: afterSnapshot.requestedDepth,
  };
  const [recentChecks, ctrDropMetrics] = await Promise.all([
    comparisonAllowed && targetRules.some((rule) => rule.conditionType === "downtrend")
      ? loadRecentCompletedChecks(keyword.id, currentCheck)
      : undefined,
    targetRules.some((rule) => rule.conditionType === "ctr_drop")
      ? loadGscCtrMetrics({
          checkedAt: afterSnapshot.checkedAt ?? new Date(),
          keywordId: keyword.id,
        }).catch(() => null)
      : undefined,
  ]);
  const hydratedAfterSnapshot = {
    ...afterSnapshot,
    ...(recentChecks ? { recentChecks } : {}),
    ...(ctrDropMetrics !== undefined ? { ctrDropMetrics } : {}),
  };
  const triggered = [];

  for (const rule of targetRules) {
    if (
      !comparisonAllowed &&
      rule.conditionType !== "ctr_drop" &&
      rule.conditionType !== "url_mismatch"
    ) {
      continue;
    }
    const depthConflict = alertDepthConflict(rule, hydratedAfterSnapshot.requestedDepth);
    if (depthConflict) {
      await emitDepthConflictSignal({
        checkedAt: hydratedAfterSnapshot.checkedAt,
        conflict: depthConflict,
        keywordId: keyword.id,
        projectId: keyword.projectId,
        rankingUrl: hydratedAfterSnapshot.rankingUrl,
        ruleId: rule.id,
      });
      continue;
    }
    const matched = matchesAlertCondition(rule, beforeSnapshot, hydratedAfterSnapshot);
    if (!matched) {
      if (
        isStatefulAlertCondition(rule.conditionType) &&
        statefulStateKnown(rule.conditionType, hydratedAfterSnapshot)
      ) {
        await resolveClearedTriggeredAlerts(keyword.id, rule.id);
      }
      continue;
    }
    // biome-ignore format: compact snooze guard keeps this module under the line cap.
    if (await prisma.triggeredAlert.findFirst({ select: { id: true }, where: { keywordId: keyword.id, ruleId: rule.id, ...activeAlertSnoozeWhere() } })) { continue; }
    if (
      isStatefulAlertCondition(rule.conditionType) &&
      (await hasOpenTriggeredAlert(keyword.id, rule.id))
    ) {
      continue;
    }

    const payload = alertPayload(rule, keyword, beforeSnapshot, hydratedAfterSnapshot);
    const downtrend =
      rule.conditionType === "downtrend"
        ? downtrendSummary(hydratedAfterSnapshot.recentChecks)
        : null;
    const storedBeforePosition = downtrend?.oldest ?? beforeSnapshot.position;
    const alert = await persistAndDeliverTriggeredAlert({
      afterPosition: hydratedAfterSnapshot.position,
      beforePosition: storedBeforePosition,
      deliveryMode,
      keyword,
      payload,
      rankCheckId: hydratedAfterSnapshot.rankCheckId ?? null,
      rule,
    });
    if (!alert) continue;

    triggered.push(alert);
  }

  return triggered;
}
