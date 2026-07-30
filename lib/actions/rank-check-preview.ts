"use server";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { unitCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly, ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import {
  isBudgetExhaustedError,
  monthlySpendCents,
  projectBudgetCapCents,
} from "@/lib/rank-check/budget";
import { loadSerpProviderChain, runKeywordCheckWithFallback } from "@/lib/rank-check/fallback";
import { RankCheckRunnerError } from "@/lib/rank-check/runner";
import { isSampleProject } from "@/lib/sample-data/marker";
import {
  getFirstCheckRunPlanSchema,
  getObservedPositionsSchema,
  listFirstCheckCandidatesSchema,
  runFirstCheckPreviewSchema,
} from "@/lib/schemas/keyword";
import { keywordMarketSelect, projectDefaultSerpMarket } from "@/lib/serp/default-market";
import {
  DEFAULT_SERP_DEPTH,
  DEFAULT_SERP_MARKET,
  SERP_ENGINE,
  serpDepthValues,
} from "@/lib/serp/markets";
import {
  getActionActor,
  parseActionInput,
  requireKeywordScope,
  requireProjectScope,
  revalidateRankCheckViews,
} from "./_shared";

export type FirstCheckCandidate = {
  id: string;
  publicId: string;
  text: string;
};

export type ListFirstCheckCandidatesResult = {
  candidates: FirstCheckCandidate[];
  hasAnalyticsSource: boolean;
  isSampleProject: boolean;
  providerReady: boolean;
};

export type FirstCheckRunPlan = {
  budget: { capCents: number; spentCents: number };
  estimatedCostPerCheckCents: number | null;
  readyCount: number;
  providers: string[];
  scope: { depth: string; device: string; engine: string; frequency: string; location: string };
  providerReady: boolean;
  isSampleProject: boolean;
  budgetExhausted: boolean;
};

export type ObservedPosition = {
  clicks: number;
  impressions: number;
  keywordId: string;
  position: number;
  text: string;
};

export type FirstCheckPreviewFailureCode =
  | "budget_exhausted"
  | "failed"
  | "no_provider"
  | "project_read_only"
  | "rate_limited"
  | "sample_project";

export type RunFirstCheckPreviewResult =
  | {
      position: number | null;
      provider: string;
      rankingUrl: string | null;
      status: "completed";
    }
  | {
      code: FirstCheckPreviewFailureCode;
      message: string;
      status: "failed";
    };

function connectionCount(projectId: string, kind: "analytics" | "serp") {
  return prisma.providerConnection.count({
    where: { enabled: true, kind, projectId, status: "connected" },
  });
}

async function firstCheckCandidates(projectId: string, limit: number) {
  const select = { id: true, publicId: true, text: true } as const;
  const uncheckedWhere = {
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
  if (remaining <= 0) return targeted;

  return [
    ...targeted,
    ...(await prisma.keyword.findMany({
      orderBy: { createdAt: "asc" },
      select,
      take: remaining,
      where: { ...uncheckedWhere, targetUrl: null },
    })),
  ];
}

export async function listFirstCheckCandidates(
  input: unknown,
): Promise<ListFirstCheckCandidatesResult> {
  const data = parseActionInput(listFirstCheckCandidatesSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "project" });
  const sampleProject = isSampleProject(project);
  const [candidates, serpConnections, analyticsConnections] = await Promise.all([
    sampleProject ? Promise.resolve([]) : firstCheckCandidates(project.id, data.limit),
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
        location: DEFAULT_SERP_MARKET,
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

function previewFailure(
  code: FirstCheckPreviewFailureCode,
  message: string,
): RunFirstCheckPreviewResult {
  return { code, message, status: "failed" };
}

function isProjectReadOnlyError(error: unknown) {
  const value = error as { code?: unknown; name?: unknown; project?: { writeMode?: unknown } };
  return (
    error instanceof ProjectReadOnlyError ||
    value.code === "project_read_only" ||
    value.name === "ProjectReadOnlyError" ||
    isProjectReadOnly(value.project?.writeMode)
  );
}

function mapPreviewError(error: unknown): RunFirstCheckPreviewResult {
  if (isProjectReadOnlyError(error)) {
    return previewFailure("project_read_only", "This project is read-only right now.");
  }
  if (isBudgetExhaustedError(error)) {
    return previewFailure("budget_exhausted", "Monthly rank-check budget reached.");
  }
  if (
    error instanceof ProviderRateLimitedError ||
    (error instanceof RankCheckRunnerError && error.code === "provider_rate_limited")
  ) {
    return previewFailure("rate_limited", "Provider rate limit reached. Try again shortly.");
  }
  if (error instanceof RankCheckRunnerError && error.code === "no_provider_connected") {
    return previewFailure("no_provider", "Connect a SERP provider before running checks.");
  }

  return previewFailure("failed", "We couldn't run this check. Try again from the dashboard.");
}

export async function runFirstCheckPreview(input: unknown): Promise<RunFirstCheckPreviewResult> {
  const data = parseActionInput(runFirstCheckPreviewSchema, input);
  const actor = await getActionActor();
  let keywordScope: Awaited<ReturnType<typeof requireKeywordScope>>;

  try {
    keywordScope = await requireKeywordScope(actor, "update", data.keywordId);
  } catch (error) {
    if (isProjectReadOnlyError(error)) return mapPreviewError(error);
    throw error;
  }

  if (keywordScope.projectIsSample) {
    return previewFailure("sample_project", "Sample projects don't run real checks.");
  }

  let result: RunFirstCheckPreviewResult;
  let auditTargetId = keywordScope.publicId;
  let auditTargetType = "keyword";
  try {
    const preview = await runKeywordCheckWithFallback({ keywordId: keywordScope.id });
    auditTargetId = requiredPublicAuditId(preview.rankCheck.publicId, "check", "Rank-check");
    auditTargetType = "rank_check";
    result = {
      position: preview.rankCheck.position,
      provider: preview.provider,
      rankingUrl: preview.rankCheck.rankingUrl ?? null,
      status: "completed",
    };
  } catch (error) {
    result = mapPreviewError(error);
  }

  await writeAudit({
    action: "rank_check.run_now",
    actorId: actor.id,
    after: { keywordId: keywordScope.publicId, preview: true, ...result },
    projectId: keywordScope.projectId,
    targetId: auditTargetId,
    targetType: auditTargetType,
  });
  revalidateRankCheckViews(keywordScope.publicId);

  return result;
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
