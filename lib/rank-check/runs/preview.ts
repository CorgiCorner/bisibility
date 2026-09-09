import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { prisma } from "@/lib/db/prisma";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import {
  assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError,
} from "@/lib/provider-usage/enforcement";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { ACTIVE_QUEUED_TASK_STATES } from "@/lib/rank-check/queued-state";
import { activeMarketLocationIds, unrunnableKeywordReason } from "@/lib/rank-check/runnable";
import type { UnrunnableReason } from "@/lib/rank-check/runnable-reasons";
import { resolveEffectiveSerpDepth, type SerpDepth } from "@/lib/serp/constants";
import { RUN_STATUSES, TERMINAL_RUN_STATUSES } from "./contract";
import { type RankCheckRunProject, requireRankCheckRunProject } from "./launch-types";
import { createPreviewToken } from "./preview-token";
import { type RunSelectionSpec, resolveRunSelection } from "./selection";

export type RankCheckRunExclusionReason =
  | "paused"
  | "manual"
  | "in_progress"
  | "no_provider"
  | "other_project"
  | UnrunnableReason;
export type RankCheckRunPreview = {
  budget: {
    blocked: boolean;
    capCents: number | null;
    mode: "allocation" | "legacy";
    reason: "budget_exhausted" | "duplicate" | "no_provider" | null;
    remainingAfterCents: number | null;
    spentCents: number | null;
  };
  estimate: {
    costCents: number | null;
    perTargetCents: number | null;
    unknownCostTargets: number;
  };
  excluded: Array<{ keywordId: string; reason: RankCheckRunExclusionReason }>;
  executable: number;
  expiresAt: string;
  keywordCount: number;
  matched: number;
  previewToken: string;
  selectionHash: string;
  targetCount: number;
};

export type RankCheckRunPreviewInput = {
  depth?: SerpDepth;
  project: RankCheckRunProject;
  providerId?: string;
  spec: RunSelectionSpec;
};
type KeywordRow = {
  archivedAt: Date | null;
  id: string;
  locationId: string;
  publicId: string;
  queuedRankCheckTasks: Array<{ state: string }>;
  rankChecks: Array<{ status: string }>;
  checkSchedule?: { serpDepth: number | null } | null;
  schedule: { serpDepth: number | null } | null;
  text: string;
};

const activeRunStatuses = RUN_STATUSES.filter(
  (status) => !(TERMINAL_RUN_STATUSES as readonly string[]).includes(status),
);

function selectedPublicIds(spec: RunSelectionSpec) {
  if (spec.kind === "single") return [spec.keywordId];
  return spec.kind === "selected" ? spec.keywordIds : [];
}

function inProgress(row: KeywordRow) {
  return row.queuedRankCheckTasks.length > 0 || row.rankChecks[0]?.status === "running";
}

function estimateTargets(
  rows: KeywordRow[],
  projectDepth: number | null | undefined,
  requestedDepth: SerpDepth | undefined,
  connection: Awaited<ReturnType<typeof loadSerpProviderChain>>[number],
) {
  const targets = rows.map((row) => {
    const depth = resolveEffectiveSerpDepth({
      projectDepth,
      requestedDepth,
      checkScheduleDepth: row.checkSchedule?.serpDepth,
      scheduleDepth: row.schedule?.serpDepth,
    });
    const cost = estimatedRankCheckCostCents(
      connection.provider,
      depth,
      connection.costPerCheckCents,
      connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
    );
    return { cost, depth };
  });
  const known = targets.flatMap(({ cost }) => (cost === null ? [] : [cost]));
  const unique = new Set(known);
  return {
    costCents: known.length > 0 ? known.reduce((sum, cost) => sum + cost, 0) : null,
    depths: targets.map(({ depth }) => depth),
    perTargetCents:
      known.length === targets.length && unique.size === 1 ? (known[0] ?? null) : null,
    unknownCostTargets: targets.length - known.length,
  };
}

async function legacyBudget(projectId: string, capCents: number, costCents: number | null) {
  try {
    const state = await assertBudgetAvailable(projectId, new Date(), {
      capCents,
      estimatedCostCents: costCents,
    });
    return {
      blocked: false,
      capCents: state.capCents,
      mode: "legacy" as const,
      reason: null,
      remainingAfterCents: Math.max(0, state.capCents - state.spentCents - (costCents ?? 0)),
      spentCents: state.spentCents,
    };
  } catch (error) {
    if (!isBudgetExhaustedError(error)) throw error;
    return {
      blocked: true,
      capCents: error.budget.capCents,
      mode: "legacy" as const,
      reason: "budget_exhausted" as const,
      remainingAfterCents: Math.max(
        0,
        error.budget.capCents - error.budget.spentCents - (costCents ?? 0),
      ),
      spentCents: error.budget.spentCents,
    };
  }
}

async function allocationBudget(
  projectId: string,
  provider: string,
  connectionId: string,
  costCents: number | null,
  depths: SerpDepth[],
) {
  try {
    await assertProviderAllocationAvailable(
      {
        catalog: PROVIDER_CATALOG,
        connectionId,
        estimatedCostCents: costCents ?? 0,
        estimatedUsageQuantity: depths.reduce((sum, depth) => sum + pagesPerCheck(depth), 0),
        legacyBudgetCheck: async () => undefined,
        projectId,
        provider,
      },
      prisma,
    );
    return { blocked: false, reason: null } as const;
  } catch (error) {
    if (!(error instanceof ProviderAllocationExhaustedError)) throw error;
    return { blocked: true, reason: "budget_exhausted" } as const;
  }
}

export async function previewRankCheckRun(
  input: RankCheckRunPreviewInput,
): Promise<RankCheckRunPreview> {
  requireRankCheckRunProject(input.project);
  const resolved = await resolveRunSelection(input.project, input.spec);
  const activeLocationIds = await activeMarketLocationIds(input.project.id, prisma);
  const [project, rows, connections, duplicate] = await Promise.all([
    prisma.project.findUnique({
      select: {
        budgetCapCents: true,
        defaults: { select: { serpDepth: true } },
        providerAllocationsInitializedAt: true,
      },
      where: { id: input.project.id },
    }),
    prisma.keyword.findMany({
      orderBy: { id: "asc" },
      select: {
        archivedAt: true,
        id: true,
        locationId: true,
        publicId: true,
        queuedRankCheckTasks: {
          select: { state: true },
          take: 1,
          where: { state: { in: ACTIVE_QUEUED_TASK_STATES } },
        },
        rankChecks: {
          orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
          select: { status: true },
          take: 1,
        },
        checkSchedule: { select: { serpDepth: true } },
        schedule: { select: { serpDepth: true } },
        text: true,
      },
      where: { id: { in: resolved.keywordIds }, projectId: input.project.id },
    }),
    loadSerpProviderChain(input.project.id, input.providerId),
    prisma.rankCheckRun.findFirst({
      select: { id: true },
      where: {
        projectId: input.project.id,
        selectionHash: resolved.selectionHash,
        status: { in: activeRunStatuses },
      },
    }),
  ]);
  if (!project) throw new Error("Project not found.");

  const matchedPublicIds = new Set(rows.map(({ publicId }) => publicId));
  const excluded: RankCheckRunPreview["excluded"] = selectedPublicIds(input.spec).flatMap(
    (keywordId) =>
      matchedPublicIds.has(keywordId) ? [] : [{ keywordId, reason: "other_project" as const }],
  );
  const executableRows = rows.filter((row) => {
    // The launch path drops non-runnable rows, so the preview must drop them too: an estimate
    // signed over a row the launch will not buy can only fail token verification, which hides
    // the paused market or archived keyword behind a preview-token error.
    const unrunnable = unrunnableKeywordReason(row, activeLocationIds);
    if (unrunnable) {
      excluded.push({ keywordId: row.publicId, reason: unrunnable });
      return false;
    }
    if (inProgress(row)) {
      excluded.push({ keywordId: row.publicId, reason: "in_progress" });
      return false;
    }
    if (!connections[0]) {
      excluded.push({ keywordId: row.publicId, reason: "no_provider" });
      return false;
    }
    // Manual previews intentionally include paused and manual cadence keywords.
    return true;
  });
  const estimate = connections[0]
    ? estimateTargets(executableRows, project.defaults?.serpDepth, input.depth, connections[0])
    : { costCents: null, depths: [], perTargetCents: null, unknownCostTargets: 0 };
  let budget: RankCheckRunPreview["budget"];
  if (duplicate) {
    budget = {
      blocked: true,
      capCents: null,
      mode: project.providerAllocationsInitializedAt ? "allocation" : "legacy",
      reason: "duplicate",
      remainingAfterCents: null,
      spentCents: null,
    };
  } else if (!connections[0]) {
    budget = {
      blocked: true,
      capCents: null,
      mode: project.providerAllocationsInitializedAt ? "allocation" : "legacy",
      reason: "no_provider",
      remainingAfterCents: null,
      spentCents: null,
    };
  } else if (!project.providerAllocationsInitializedAt) {
    budget = await legacyBudget(input.project.id, project.budgetCapCents, estimate.costCents);
  } else {
    if (!connections[0].id) throw new Error("Provider connection not found.");
    const allocation = await allocationBudget(
      input.project.id,
      connections[0].provider,
      connections[0].id,
      estimate.costCents,
      estimate.depths,
    );
    budget = {
      ...allocation,
      capCents: null,
      mode: "allocation",
      remainingAfterCents: null,
      spentCents: null,
    };
  }
  const signed = createPreviewToken({
    depth: input.depth ?? null,
    estimateCents: estimate.costCents ?? -1,
    projectId: input.project.id,
    providerId: input.providerId ?? null,
    selectionHash: resolved.selectionHash,
  });
  return {
    budget,
    estimate: {
      costCents: estimate.costCents,
      perTargetCents: estimate.perTargetCents,
      unknownCostTargets: estimate.unknownCostTargets,
    },
    excluded,
    executable: executableRows.length,
    expiresAt: signed.expiresAt.toISOString(),
    keywordCount: new Set(executableRows.map(({ text }) => text)).size,
    matched: resolved.keywordIds.length,
    previewToken: signed.token,
    selectionHash: resolved.selectionHash,
    targetCount: executableRows.length,
  };
}
