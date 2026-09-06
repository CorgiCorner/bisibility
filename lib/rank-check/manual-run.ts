import "server-only";

import {
  getActionActor,
  parseActionInput,
  requireKeywordScope,
  revalidateRankCheckViews,
} from "@/lib/actions/_shared";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { budgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import { inlineRankCheckExecutionEnabled } from "@/lib/rank-check/inline-execution";
import { launchSingleRankCheckRun } from "@/lib/rank-check/runs/launch-single";
import {
  ALREADY_IN_PROGRESS_REASON,
  isLaunchRankCheckRunNothingToRun,
  LaunchRankCheckRunError,
  type LaunchRankCheckRunNothingToRunReason,
  UnrunnableInlineRankCheckError,
} from "@/lib/rank-check/runs/launch-types";
import { runCheckNowSchema } from "@/lib/schemas/keyword";
import type { RunCheckNowBlockedCode, RunCheckNowResult } from "./manual-run-result";

/**
 * This surface has called a check already in flight `check_in_progress` since before the predicate
 * reasons existed, so that one code is translated and the rest are passed through unchanged.
 */
function blockedCode(reason: LaunchRankCheckRunNothingToRunReason): RunCheckNowBlockedCode {
  return reason === ALREADY_IN_PROGRESS_REASON ? "check_in_progress" : reason;
}

export type { RunCheckNowResult } from "./manual-run-result";

export async function manualRunCheckNow(input: unknown): Promise<RunCheckNowResult> {
  const data = parseActionInput(runCheckNowSchema, input);
  const actor = await getActionActor();
  const keyword = await requireKeywordScope(actor, "update", data.keywordId);
  if (keyword.projectIsSample) {
    return {
      code: "sample_project",
      message: "Sample projects don't run real checks.",
      status: "not_started",
    };
  }
  const project = await prisma.project.findUniqueOrThrow({
    select: { domain: true, id: true, isSample: true },
    where: { id: keyword.projectId },
  });
  const inlineExecution = inlineRankCheckExecutionEnabled();

  let launched: Awaited<ReturnType<typeof launchSingleRankCheckRun>>;
  try {
    launched = await launchSingleRankCheckRun({
      actorId: actor.id,
      depth: data.depth,
      keywordId: keyword.publicId as `kw_${string}`,
      project,
      providerId: data.providerId,
      trigger: "manual",
    });
  } catch (error) {
    if (error instanceof LaunchRankCheckRunError && error.code === "budget_exhausted") {
      return budgetExhaustedResult(error.message);
    }
    if (error instanceof LaunchRankCheckRunError && error.code === "no_provider") {
      return { code: "no_provider", message: error.message, status: "not_started" };
    }
    throw error;
  }
  if (isLaunchRankCheckRunNothingToRun(launched)) {
    return {
      code: blockedCode(launched.reason),
      message: launched.message,
      status: "not_started",
    };
  }

  let result: RunCheckNowResult = { runId: launched.publicId, status: "queued" };
  if (inlineExecution) {
    const { runInlineRankCheck } = await import("./runs/inline");
    let inline: Awaited<ReturnType<typeof runInlineRankCheck>>;
    try {
      inline = await runInlineRankCheck({
        depth: data.depth,
        keywordId: keyword.id,
        providerId: data.providerId,
        runPublicId: launched.publicId,
      });
    } catch (error) {
      // The same refusal the launch makes, one step later: report it the same way rather than
      // letting it fall through as an unhandled failure.
      if (!(error instanceof UnrunnableInlineRankCheckError)) throw error;
      revalidateRankCheckViews(keyword.publicId);
      return { code: error.reason, message: error.message, status: "not_started" };
    }
    const rankCheck = await prisma.rankCheck.findUniqueOrThrow({
      select: { publicId: true, requestedDepth: true },
      where: { id: inline.rankCheckId },
    });
    result = {
      attempts: inline.attempts.length,
      billingUnits: null,
      position: inline.position,
      provider: inline.provider,
      rankCheckId: rankCheck.publicId ?? inline.rankCheckId,
      requestedDepth: rankCheck.requestedDepth,
      runId: launched.publicId,
      status: "completed",
    };
  }

  await writeAudit({
    action: "rank_check.run_now",
    actorId: actor.id,
    after: { keywordId: keyword.publicId, provider: data.providerId ?? "primary", ...result },
    projectId: keyword.projectId,
    targetId: launched.publicId,
    targetType: "rank_check_run",
  });
  revalidateRankCheckViews(keyword.publicId);
  return result;
}
