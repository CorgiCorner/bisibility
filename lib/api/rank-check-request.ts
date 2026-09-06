import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { inlineRankCheckExecutionEnabled } from "@/lib/rank-check/inline-execution";
import { launchSingleRankCheckRun } from "@/lib/rank-check/runs/launch-single";
import { isLaunchRankCheckRunNothingToRun } from "@/lib/rank-check/runs/launch-types";
import type { ApiContext } from "./context";
import { rankCheckResource, rankCheckSelect } from "./resources";
import { errorResponse, resourceResponse } from "./responses";

type ScopedKeyword = {
  id: string;
  project: { domain: string | null; isSample: boolean };
  projectId: string;
  publicId: string;
};

type RequestInput = { provider_id?: string };

export async function requestRankCheck(
  ctx: ApiContext,
  data: RequestInput,
  keyword: ScopedKeyword,
) {
  const inlineExecution = inlineRankCheckExecutionEnabled();
  const launched = await launchSingleRankCheckRun({
    actorId: ctx.actorId ?? null,
    keywordId: keyword.publicId as `kw_${string}`,
    project: {
      domain: keyword.project.domain,
      id: keyword.projectId,
      isSample: keyword.project.isSample,
    },
    providerId: data.provider_id,
    trigger: "api",
  });
  if (isLaunchRankCheckRunNothingToRun(launched)) {
    // The launch names why nothing ran; the reason travels with the message so a client can tell
    // a paused market from a check that is genuinely already in flight without parsing prose.
    return errorResponse("conflict", launched.message, 409, {
      details: { code: launched.reason },
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }

  if (!inlineExecution) {
    await writeAudit({
      action: "rank_check.requested",
      actorId: ctx.actorId ?? null,
      after: {
        keywordId: keyword.publicId,
        provider: data.provider_id ?? "primary",
        runId: launched.publicId,
        status: "queued",
      },
      projectId: keyword.projectId,
      targetId: launched.publicId,
      targetType: "rank_check_run",
    });
    return resourceResponse(
      { id: launched.publicId, status: "queued" as const },
      { headers: ctx.headers, status: 202 },
    );
  }

  try {
    const { runInlineRankCheck } = await import("@/lib/rank-check/runs/inline");
    const inline = await runInlineRankCheck({
      keywordId: keyword.id,
      providerId: data.provider_id,
      runPublicId: launched.publicId,
    });
    const rankCheck = await prisma.rankCheck.findUniqueOrThrow({
      select: rankCheckSelect,
      where: { id: inline.rankCheckId },
    });
    await writeAudit({
      action: "rank_check.run_now",
      actorId: ctx.actorId ?? null,
      after: {
        keywordId: keyword.publicId,
        provider: inline.provider,
        runId: launched.publicId,
        status: "completed",
      },
      projectId: keyword.projectId,
      targetId: launched.publicId,
      targetType: "rank_check_run",
    });
    return resourceResponse(rankCheckResource({ ...rankCheck, keyword }), {
      headers: ctx.headers,
      status: 201,
    });
  } catch (error) {
    await writeAudit({
      action: "rank_check.run_now",
      actorId: ctx.actorId ?? null,
      after: { keywordId: keyword.publicId, provider: data.provider_id ?? "primary" },
      projectId: keyword.projectId,
      status: "failed",
      statusReason: error instanceof Error ? error.message : "Rank check failed.",
      targetId: launched.publicId,
      targetType: "rank_check_run",
    }).catch(() => undefined);
    throw error;
  }
}
