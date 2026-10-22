import { prisma } from "@/lib/db/prisma";
import { launchPolicyBlock } from "@/lib/measurement-definitions/host-launch-policy";
import { readHostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-snapshot";
import { budgetDenialReason } from "@/lib/metering/budget-denial";
import { connectionFunding, type ProjectFunding } from "@/lib/metering/project-funding-budgets";
import { surfaceOf } from "@/lib/provider-usage/surface";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import type { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { activeMarketLocationIds, unrunnableKeywordReason } from "@/lib/rank-check/runnable";
import { appPath } from "@/lib/routing/app-path";
import { resolveSerpStopOnMatch, type SerpDepth } from "@/lib/serp/constants";
import { ACTIVE_RUN_STATUSES } from "./contract";
import { hostedReservationCustomerCents } from "./customer-charge";
import { requireRankCheckRunProject } from "./launch-types";
import { quoteRunRows } from "./native-quotes";
import { prepareRankPayment } from "./payment";
import { loadRankPaymentSources, rankPaymentOptions } from "./payment-sources";
import { allocationBudget } from "./preview-budget";
import { findRankCheckRunOverlaps } from "./preview-overlaps";
import { previewSourceHash } from "./preview-source-hash";
import { createPreviewToken } from "./preview-token";
import type { RankCheckRunPreview, RankCheckRunPreviewInput } from "./preview-types";
import {
  type RunSelectionKeyword,
  type RunSelectionSpec,
  resolveRunSelection,
  runSelectionKeywordHeld,
  runSelectionKeywordSelect,
} from "./selection";

type KeywordRow = RunSelectionKeyword & { publicId: string };
// API launches refuse a repeat of an active scope; blocked runs retain their reservation.
const duplicateRunStatuses = [...ACTIVE_RUN_STATUSES, "blocked"];

function selectedPublicIds(spec: RunSelectionSpec) {
  if (spec.kind === "single") return [spec.keywordId];
  return spec.kind === "selected" ? spec.keywordIds : [];
}

async function estimateTargets(
  rows: KeywordRow[],
  projectDepth: number | null | undefined,
  requestedDepth: SerpDepth | undefined,
  connection: Awaited<ReturnType<typeof loadSerpProviderChain>>[number],
) {
  const estimate = await quoteRunRows(rows, projectDepth, { depth: requestedDepth }, connection);
  const known = estimate.targets.flatMap(({ cost }) => (cost === null ? [] : [cost]));
  const unique = new Set(known);
  return {
    costCents: estimate.costCents,
    depths: estimate.targets.map(({ depth }) => depth),
    native: estimate.native,
    targets: estimate.targets,
    perTargetCents:
      known.length === estimate.targets.length && unique.size === 1 ? (known[0] ?? null) : null,
    unknownCostTargets: estimate.targets.length - known.length,
  };
}

// biome-ignore format: compact helper keeps this module under the project line cap.
function remainingAfterCents(state: { capCents: number; reservedCents?: number; spentCents: number }, costCents: number | null) {
  return Math.max(0, state.capCents - state.spentCents - (state.reservedCents ?? 0) - (costCents ?? 0));
}

async function previewProjectBudget(
  projectId: string,
  costCents: number | null,
  funding: ProjectFunding,
  estimatedCustomerCents?: number,
) {
  const compared =
    funding === "platform" && estimatedCustomerCents !== undefined
      ? estimatedCustomerCents
      : costCents;
  try {
    const state = await assertBudgetAvailable(projectId, new Date(), {
      estimatedCostCents: costCents,
      ...(estimatedCustomerCents !== undefined ? { estimatedCustomerCents } : {}),
      funding,
    });
    return {
      blocked: false,
      capCents: state.capCents,
      mode: "legacy" as const,
      reason: null,
      remainingAfterCents: remainingAfterCents(state, compared),
      spentCents: state.spentCents,
    };
  } catch (error) {
    if (!isBudgetExhaustedError(error)) throw error;
    return {
      blocked: true,
      capCents: error.budget.capCents,
      mode: "legacy" as const,
      reason: budgetDenialReason(error) ?? ("budget_exhausted" as const),
      remainingAfterCents: remainingAfterCents(error.budget, compared),
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
        domain: true,
        publicId: true,
        defaults: { select: { serpDepth: true, serpStopOnMatch: true } },
      },
      where: { id: input.project.id },
    }),
    prisma.keyword.findMany({
      orderBy: { id: "asc" },
      select: { ...runSelectionKeywordSelect, publicId: true },
      where: { id: { in: resolved.keywordIds }, projectId: input.project.id },
    }),
    loadRankPaymentSources(input.project.id, input.providerId, input.paymentOptionId),
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
    ? await estimateTargets(
        executableRows,
        project.defaults?.serpDepth,
        input.depth,
        connections[0],
      )
    : {
        costCents: null,
        depths: [],
        perTargetCents: null,
        targets: [],
        unknownCostTargets: 0,
      };
  let budget: RankCheckRunPreview["budget"];
  if (duplicate) {
    budget = {
      blocked: true,
      capCents: null,
      mode: "allocation",
      reason: "duplicate",
      remainingAfterCents: null,
      spentCents: null,
    };
  } else if (!connections[0]) {
    budget = {
      blocked: true,
      capCents: null,
      mode: "allocation",
      reason: "no_provider",
      remainingAfterCents: null,
      spentCents: null,
    };
  } else {
    if (!connections[0].id) throw new Error("Provider connection not found.");
    const funding = connectionFunding(connections[0].credentialSource);
    const estimatedCustomerCents =
      funding === "platform"
        ? await hostedReservationCustomerCents({
            connection: connections[0],
            projectId: input.project.id,
            source: input.origin.source,
            targets: estimate.targets,
          })
        : undefined;
    const allocation = await allocationBudget(
      input.project.id,
      connections[0].provider,
      connections[0].id,
      estimate.costCents,
      estimate.depths,
      surfaceOf(input.origin.source),
      estimatedCustomerCents,
    );
    const projectBudget = await previewProjectBudget(
      input.project.id,
      estimate.costCents,
      funding,
      estimatedCustomerCents,
    );
    budget = {
      ...allocation,
      ...(projectBudget.blocked ? { blocked: true, reason: projectBudget.reason } : {}),
      capCents: projectBudget.capCents,
      mode: "allocation",
      remainingAfterCents: projectBudget.remainingAfterCents,
      spentCents: projectBudget.spentCents,
    };
  }
  const measurementPolicy = await prisma.$transaction(
    (tx) => readHostPolicySnapshot(tx, input.project.id),
    { isolationLevel: "RepeatableRead" },
  );
  const policyBlock = launchPolicyBlock(
    measurementPolicy,
    connections[0]?.provider,
    executableRows,
    estimate.depths,
  );
  if (policyBlock && connections[0]) budget = { ...budget, blocked: true, reason: policyBlock };
  const sourceHash = previewSourceHash({
    domain: project.domain,
    stopOnMatch: resolveSerpStopOnMatch(project.defaults?.serpStopOnMatch),
    rows: executableRows,
    depths: estimate.depths,
    provider: connections[0] ?? null,
    measurementPolicy,
  });
  const payment =
    connections[0] && "targets" in estimate
      ? await prepareRankPayment({
          actorId: input.actorId,
          projectId: input.project.id,
          source: input.origin.source,
          sourceHash,
          selectionHash: resolved.selectionHash,
          connection: connections[0],
          targets: estimate.targets,
        })
      : null;
  const signed = createPreviewToken({
    depth: input.depth ?? null,
    estimateCents: estimate.costCents ?? -1,
    projectId: input.project.id,
    providerId: input.providerId ?? null,
    selectionHash: resolved.selectionHash,
    sourceHash,
    trigger,
  });
  return {
    ...(payment ? { payment: payment.quote, paymentOptions: rankPaymentOptions(connections) } : {}),
    budget,
    measurementPolicy: {
      state: measurementPolicy.state,
      policyEpoch: measurementPolicy.policyEpoch,
      configurationHref: `${appPath(project.publicId, "settings", "tracking")}#measurement-policy`,
    },
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

export type {
  RankCheckRunExclusionReason,
  RankCheckRunPreview,
  RankCheckRunPreviewInput,
} from "./preview-types";
