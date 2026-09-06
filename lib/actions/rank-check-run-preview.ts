"use server";

import { previewRankCheckRun } from "@/lib/rank-check/runs/preview";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import {
  type PreviewRankCheckRunActionResult,
  previewRankCheckRunActionSchema,
} from "./rank-check-run-preview-result";

export async function previewRankCheckRunAction(
  input: unknown,
): Promise<PreviewRankCheckRunActionResult> {
  const data = parseActionInput(previewRankCheckRunActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  return previewRankCheckRun({
    depth: data.depth,
    project,
    providerId: data.providerId,
    spec: data.spec,
  });
}
