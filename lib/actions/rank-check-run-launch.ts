"use server";

import { launchRankCheckRun } from "@/lib/rank-check/runs/launch";
import { LaunchRankCheckRunError, SampleProjectError } from "@/lib/rank-check/runs/launch-types";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import {
  type LaunchRankCheckRunActionFailure,
  type LaunchRankCheckRunActionResult,
  launchRankCheckRunActionSchema,
} from "./rank-check-run-launch-result";

function failure(
  code: LaunchRankCheckRunActionFailure["code"],
  message: string,
): LaunchRankCheckRunActionFailure {
  return { code, message, status: "not_started" };
}

export async function launchRankCheckRunAction(
  input: unknown,
): Promise<LaunchRankCheckRunActionResult> {
  const data = parseActionInput(launchRankCheckRunActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  try {
    return await launchRankCheckRun({
      actorId: actor.id,
      depth: data.depth,
      idempotencyKey: data.idempotencyKey,
      previewToken: data.previewToken,
      project,
      providerId: data.providerId,
      spec: data.spec,
      trigger: "manual",
    });
  } catch (error) {
    if (error instanceof PreviewTokenError) {
      return failure(
        error.code === "expired" ? "preview_expired" : "preview_mismatch",
        error.message,
      );
    }
    if (error instanceof LaunchRankCheckRunError) return failure(error.code, error.message);
    if (error instanceof SampleProjectError) return failure(error.code, error.message);
    throw error;
  }
}
