import { estimateRankUsage, type NativeUsageEstimate } from "@/lib/cost-estimate/native-usage";
import { prisma } from "@/lib/db/prisma";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import {
  type ProviderRequestOrigin,
  type ProviderRequestSurface,
  surfaceOf,
} from "@/lib/provider-usage/surface";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { activeMarketLocationIds, unrunnableKeywordReason } from "@/lib/rank-check/runnable";
import type { UnrunnableReason } from "@/lib/rank-check/runnable-reasons";
import { resolveEffectiveSerpDepth, type SerpDepth } from "@/lib/serp/constants";
import { ACTIVE_RUN_STATUSES } from "./contract";
import { type RankCheckRunProject, requireRankCheckRunProject } from "./launch-types";
import { allocationBudget } from "./preview-budget";
import { findRankCheckRunOverlaps, type RankCheckRunOverlap } from "./preview-overlaps";
import { createPreviewToken } from "./preview-token";
import {
  type RunLaunchTrigger,
  type RunSelectionKeyword,
  type RunSelectionSpec,
  resolveRunSelection,
  runSelectionKeywordHeld,
  runSelectionKeywordSelect,
} from "./selection";

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
    surface?: ProviderRequestSurface;
  };
  estimate: {
    native?: NativeUsageEstimate;
    costCents: number | null;
    perTargetCents: number | null;
    unknownCostTargets: number;
  };
  excluded: Array<{ keywordId: string; reason: RankCheckRunExclusionReason }>;
  executable: number;
  expiresAt: string;
  keywordCount: number;
  matched: number;
  /** Other runs that also check some of these keywords; reported for manual previews only. */
  overlapRunCount: number;
  overlaps: RankCheckRunOverlap[];
  previewToken: string;
  selectionHash: string;
  targetCount: number;
};

export type RankCheckRunPreviewInput = {
  depth?: SerpDepth;
  origin: ProviderRequestOrigin;
  project: RankCheckRunProject;
  providerId?: string;
  spec: RunSelectionSpec;
  /** The launch this preview signs for. Defaults to the protective API rule. */
  trigger?: RunLaunchTrigger;
};
type KeywordRow = RunSelectionKeyword & { publicId: string };

// API launches refuse a repeat of an active scope; blocked runs retain their reservation.
const duplicateRunStatuses = [...ACTIVE_RUN_STATUSES, "blocked"];

function selectedPublicIds(spec: RunSelectionSpec) {
  if (spec.kind === "single") return [spec.keywordId];
  return spec.kind === "selected" ? spec.keywordIds : [];
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
    native: estimateRankUsage(
      targets.map(({ depth }) => depth),
      {
        providerId: connection.provider,
        overrideCents:
          connection.costPerCheckCents == null ? null : Number(connection.costPerCheckCents),
        rateContext: connection.rateContext,
      },
    ),
    perTargetCents:
      known.length === targets.length && unique.size === 1 ? (known[0] ?? null) : null,
    unknownCostTargets: targets.length - known.length,
  };
}

// biome-ignore format: compact helper keeps this module under the project line cap.
function remainingAfterCents(state: { capCents: number; reservedCents?: number; spentCents: number }, costCents: number | null) {
  return Math.max(0, state.capCents - state.spentCents - (state.reservedCents ?? 0) - (costCents ?? 0));
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
      remainingAfterCents: remainingAfterCents(state, costCents),
      spentCents: state.spentCents,
    };
  } catch (error) {
    if (!isBudgetExhaustedError(error)) throw error;
    return {
      blocked: true,
      capCents: error.budget.capCents,
      mode: "legacy" as const,
      reason: "budget_exhausted" as const,
      remainingAfterCents: remainingAfterCents(error.budget, costCents),
      spentCents: error.budget.spentCents,
    };
  }
}

export async function previewRankCheckRun(
  input: RankCheckRunPreviewInput,
): Promise<RankCheckRunPreview> {
  requireRankCheckRunProject(input.project);
  const trigger = input.trigger ?? "api";
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
      select: { ...runSelectionKeywordSelect, publicId: true },
      where: { id: { in: resolved.keywordIds }, projectId: input.project.id },
    }),
    loadSerpProviderChain(input.project.id, input.providerId),
    // A manual launch runs alongside another run over the same scope and reports it instead.
    trigger === "manual"
      ? null
      : prisma.rankCheckRun.findFirst({
          select: { id: true },
          where: {
            projectId: input.project.id,
            selectionHash: resolved.selectionHash,
            status: { in: duplicateRunStatuses },
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
    // Launch drops the same held rows for this trigger; the signed estimate must drop them too.
    if (runSelectionKeywordHeld(row, trigger)) {
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
  const overlaps =
    trigger === "manual"
      ? await findRankCheckRunOverlaps(
          input.project.id,
          executableRows.map(({ id }) => id),
          new Date(),
        )
      : { runs: [], total: 0 };
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
      surfaceOf(input.origin.source),
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
    trigger,
  });
  return {
    budget,
    estimate: {
      native: "native" in estimate ? estimate.native : undefined,
      costCents: estimate.costCents,
      perTargetCents: estimate.perTargetCents,
      unknownCostTargets: estimate.unknownCostTargets,
    },
    excluded,
    executable: executableRows.length,
    expiresAt: signed.expiresAt.toISOString(),
    keywordCount: new Set(executableRows.map(({ text }) => text)).size,
    matched: resolved.keywordIds.length,
    overlapRunCount: overlaps.total,
    overlaps: overlaps.runs,
    previewToken: signed.token,
    selectionHash: resolved.selectionHash,
    targetCount: executableRows.length,
  };
}
