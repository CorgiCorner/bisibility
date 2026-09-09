"use server";

import { writeAudit } from "@/lib/auth/audit";
import { unitCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import { prisma } from "@/lib/db/prisma";
import { firstCheckTargets } from "@/lib/queries/first-check-targets";
import { monthlySpendCents, projectBudgetCapCents } from "@/lib/rank-check/budget";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { launchSingleRankCheckRun } from "@/lib/rank-check/runs/launch-single";
import {
  isLaunchRankCheckRunNothingToRun,
  LaunchRankCheckRunError,
} from "@/lib/rank-check/runs/launch-types";
import { isSampleProject } from "@/lib/sample-data/marker";
import {
  getFirstCheckRunPlanSchema,
  getObservedPositionsSchema,
  listFirstCheckCandidatesSchema,
  runFirstCheckPreviewSchema,
} from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, SERP_ENGINE, serpDepthValues } from "@/lib/serp/constants";
import { serpCountryByCode } from "@/lib/serp/country-catalog";
import { keywordMarketSelect, projectDefaultSerpMarket } from "@/lib/serp/default-market";
import {
  getActionActor,
  parseActionInput,
  requireKeywordScope,
  requireProjectScope,
  revalidateRankCheckViews,
} from "./_shared";
import { emitFirstCheckPreviewResult } from "./rank-check-preview-analytics";
import {
  expectedPreviewFailure,
  type FirstCheckRunPlan,
  isProjectReadOnlyError,
  type ListFirstCheckCandidatesResult,
  type ObservedPosition,
  previewFailure,
  type RunFirstCheckPreviewResult,
  unexpectedPreviewFailure,
} from "./rank-check-preview-result";

export type {
  FirstCheckCandidate,
  FirstCheckPreviewFailureCode,
  FirstCheckRunPlan,
  ListFirstCheckCandidatesResult,
  ObservedPosition,
  RunFirstCheckPreviewResult,
} from "./rank-check-preview-result";

// biome-ignore format: compact helper keeps this module under the project line cap.
function connectionCount(projectId: string, kind: "analytics" | "serp") { return prisma.providerConnection.count({ where: { enabled: true, kind, projectId, status: "connected" } }); }

async function firstCheckCandidates(projectId: string, limit: number, keywordText?: string) {
  const select = {
    device: true,
    id: true,
    locationRef: { select: { displayName: true, languageLabel: true } },
    publicId: true,
    text: true,
  } as const;
  const uncheckedWhere = {
    ...(keywordText ? { text: keywordText } : {}),
    projectId,
    rankChecks: { none: { status: "completed" } },
  } as const;
  const targeted = await prisma.keyword.findMany({
    orderBy: { createdAt: "asc" },
    select,
    take: limit,
    where: { ...uncheckedWhere, targetUrl: { not: null } },
  });
  const remaining = limit - targeted.length;
  if (remaining <= 0) return targeted.map(firstCheckCandidate);

  return [
    ...targeted,
    ...(await prisma.keyword.findMany({
      orderBy: { createdAt: "asc" },
      select,
      take: remaining,
      where: { ...uncheckedWhere, targetUrl: null },
    })),
  ].map(firstCheckCandidate);
}

// biome-ignore format: compact mapper keeps this module under the project line cap.
function firstCheckCandidate(row: {
  device: "desktop" | "mobile";
  id: string;
  locationRef: { displayName: string; languageLabel: string };
  publicId: string;
  text: string;
}) { return { device: row.device, id: row.id, market: { languageLabel: row.locationRef.languageLabel, locationLabel: row.locationRef.displayName }, publicId: row.publicId, text: row.text }; }

export async function listFirstCheckCandidates(
  input: unknown,
): Promise<ListFirstCheckCandidatesResult> {
  const data = parseActionInput(listFirstCheckCandidatesSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "project" });
  const sampleProject = isSampleProject(project);
  const [candidates, serpConnections, analyticsConnections] = await Promise.all([
    sampleProject
      ? Promise.resolve([])
      : data.includeExisting && data.keywordText
        ? firstCheckTargets(project.id, data.keywordText, data.limit)
        : firstCheckCandidates(project.id, data.limit, data.keywordText),
    sampleProject ? Promise.resolve(0) : connectionCount(project.id, "serp"),
    connectionCount(project.id, "analytics"),
  ]);

  return {
    candidates,
    hasAnalyticsSource: analyticsConnections > 0,
    isSampleProject: sampleProject,
    providerReady: serpConnections > 0,
  };
}

// biome-ignore format: compact label table keeps this file under the project line cap.
const frequencyLabels: Record<string, string> = { custom_cron: "Custom cron", daily: "Daily", manual: "Manual", monthly: "Monthly", paused: "Paused", weekly: "Weekly" };
const samplePreviewCountry = (() => {
  const country = serpCountryByCode("US");
  if (!country) throw new Error("The default country is missing from the country catalog.");
  return country;
})();

function previewSerpDepth(value: number | null | undefined) {
  return serpDepthValues.find((depth) => depth === value) ?? DEFAULT_SERP_DEPTH;
}

export async function getFirstCheckRunPlan(input: unknown): Promise<FirstCheckRunPlan> {
  const data = parseActionInput(getFirstCheckRunPlanSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "project" });
  if (isSampleProject(project)) {
    const [capCents, spentCents] = await Promise.all([
      projectBudgetCapCents(project.id),
      monthlySpendCents(project.id),
    ]);
    return {
      budget: { capCents, spentCents },
      budgetExhausted: false,
      estimatedCostPerCheckCents: null,
      isSampleProject: true,
      providerReady: false,
      providers: [],
      readyCount: 0,
      scope: {
        depth: `Top ${DEFAULT_SERP_DEPTH}`,
        device: "Desktop",
        engine: SERP_ENGINE.label,
        frequency: "Daily",
        location: samplePreviewCountry.displayName,
      },
    };
  }
  const [readyCount, connections, defaults, keywords, spentCents, capCents] = await Promise.all([
    prisma.keyword.count({
      where: { projectId: project.id, rankChecks: { none: { status: "completed" } } },
    }),
    loadSerpProviderChain(project.id),
    prisma.projectDefaults.findUnique({ where: { projectId: project.id } }),
    prisma.keyword.findMany({ select: keywordMarketSelect, where: { projectId: project.id } }),
    monthlySpendCents(project.id),
    projectBudgetCapCents(project.id),
  ]);
  const market = projectDefaultSerpMarket(defaults, keywords);
  const providers = connections.map((connection) => connection.provider);
  const depth = previewSerpDepth(defaults?.serpDepth);
  const estimatedCostPerCheckCents = unitCostCentsFor(
    {
      overrideCents:
        connections[0]?.costPerCheckCents == null ? null : Number(connections[0].costPerCheckCents),
      providerId: connections[0]?.provider ?? null,
      rateContext: connections[0]?.rateContext,
    },
    depth,
  );
  return {
    budget: { capCents, spentCents },
    budgetExhausted: spentCents >= capCents,
    estimatedCostPerCheckCents,
    isSampleProject: false,
    providerReady: providers.length > 0,
    providers,
    readyCount,
    scope: {
      depth: `Top ${depth}`,
      device: market.device === "mobile" ? "Mobile" : "Desktop",
      engine: SERP_ENGINE.label,
      frequency: frequencyLabels[defaults?.frequency ?? "daily"] ?? "Daily",
      location: market.displayName,
    },
  };
}

export async function runFirstCheckPreview(input: unknown): Promise<RunFirstCheckPreviewResult> {
  const startedAt = Date.now();
  const data = parseActionInput(runFirstCheckPreviewSchema, input);
  const actor = await getActionActor();
  let keywordScope: Awaited<ReturnType<typeof requireKeywordScope>>;

  try {
    keywordScope = await requireKeywordScope(actor, "update", data.keywordId);
  } catch (error) {
    const expected = expectedPreviewFailure(error);
    if (isProjectReadOnlyError(error) && expected) return expected;
    throw error;
  }

  if (keywordScope.projectIsSample) {
    return previewFailure("sample_project", "Sample projects don't run real checks.");
  }
  const emitResult = async (result: RunFirstCheckPreviewResult) => {
    await emitFirstCheckPreviewResult({
      actorId: actor.id,
      projectId: keywordScope.projectId,
      result,
      startedAt,
    });
    return result;
  };
  try {
    try {
      const project = await prisma.project.findUniqueOrThrow({
        select: { domain: true, id: true, isSample: true },
        where: { id: keywordScope.projectId },
      });
      const launched = await launchSingleRankCheckRun({
        actorId: actor.id,
        keywordId: keywordScope.publicId as `kw_${string}`,
        project,
        trigger: "manual",
      });
      const result: RunFirstCheckPreviewResult = isLaunchRankCheckRunNothingToRun(launched)
        ? previewFailure("failed", launched.message)
        : { runId: launched.publicId, status: "queued" };
      await writeAudit({
        action: "rank_check.run_now",
        actorId: actor.id,
        after: { keywordId: keywordScope.publicId, preview: true, ...result },
        projectId: keywordScope.projectId,
        targetId: "runId" in result ? result.runId : keywordScope.publicId,
        targetType: "runId" in result ? "rank_check_run" : "keyword",
      });
      revalidateRankCheckViews(keywordScope.publicId);
      return emitResult(result);
    } catch (error) {
      if (error instanceof LaunchRankCheckRunError && error.code === "budget_exhausted") {
        return emitResult(previewFailure("budget_exhausted", error.message));
      }
      const expected = expectedPreviewFailure(error);
      if (!expected) throw error;
      return emitResult(expected);
    }
  } catch (error) {
    return emitResult(
      unexpectedPreviewFailure(error, {
        keywordId: keywordScope.publicId,
        projectId: keywordScope.projectPublicId,
      }),
    );
  }
}

export async function getObservedPositions(input: unknown): Promise<ObservedPosition[]> {
  const data = parseActionInput(getObservedPositionsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "project" });
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const snapshots = await prisma.keywordTrafficSnapshot.findMany({
    orderBy: [{ keywordId: "asc" }, { date: "desc" }, { provider: "asc" }],
    select: {
      clicks: true,
      impressions: true,
      keyword: { select: { text: true } },
      keywordId: true,
      position: true,
    },
    where: { date: { gte: since }, keyword: { projectId: project.id } },
  });
  const latest = new Map<string, (typeof snapshots)[number]>();

  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.keywordId)) latest.set(snapshot.keywordId, snapshot);
  }

  return Array.from(latest.values()).map((snapshot) => ({
    clicks: snapshot.clicks,
    impressions: snapshot.impressions,
    keywordId: snapshot.keywordId,
    position: snapshot.position,
    text: snapshot.keyword.text,
  }));
}
