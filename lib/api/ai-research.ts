import "server-only";
import { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import { analyzeAiVisibility, compareAiPrompts } from "@/lib/ai-research/service";
import type { ApiContext } from "./context";
import { providerOrigin } from "./request-origin";
import { dataResponse, errorResponse } from "./responses";
import { readJsonBody, scopedProject, snakeizeKeys } from "./surface";

async function postAnalysis(ctx: ApiContext, projectId: string, mode: "visibility" | "prompt") {
  const scope = scopedProject(ctx, projectId);
  if (scope) return scope;
  const input = (mode === "visibility" ? visibilitySchema : promptSchema).parse(
    await readJsonBody(ctx),
  );
  const context = {
    projectId: ctx.auth.project.id,
    actorId: ctx.actorId,
    origin: providerOrigin(ctx.origin),
  };
  const result = await (mode === "visibility" ? analyzeAiVisibility : compareAiPrompts)(
    context,
    input,
  );
  return result.ok
    ? dataResponse(snakeizeKeys(result), { headers: ctx.headers })
    : errorResponse(
        result.reason === "no_source" ? "not_found" : "provider_unavailable",
        result.message,
        result.reason === "no_source" ? 404 : 422,
        { headers: ctx.headers, instance: ctx.instance, details: { reason: result.reason } },
      );
}
export function postAiVisibility(ctx: ApiContext, projectId: string) {
  return postAnalysis(ctx, projectId, "visibility");
}
export function postPromptExplorer(ctx: ApiContext, projectId: string) {
  return postAnalysis(ctx, projectId, "prompt");
}
