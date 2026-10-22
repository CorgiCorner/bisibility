import { paymentResource } from "./action-payment";
import "server-only";
import { getAiResearchCatalog } from "@/lib/ai-research/catalog-service";
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
    ? dataResponse(
        { ...(snakeizeKeys(result) as object), ...paymentResource(result) },
        { headers: ctx.headers },
      )
    : errorResponse(
        result.reason === "no_source"
          ? "not_found"
          : result.reason === "cost_limit_exceeded" && input.max_cost_cents === 0
            ? "cost_limit_exceeded"
            : "provider_unavailable",
        result.message,
        result.reason === "no_source" ? 404 : 422,
        {
          headers: ctx.headers,
          instance: ctx.instance,
          ...(result.estimatedCostCents === undefined
            ? {}
            : { problemDetails: { estimated_cost_cents: result.estimatedCostCents } }),
          details: {
            reason: result.reason,
            retry_blocked: result.retryBlocked ?? false,
            safe_to_start_new_request: result.safeToStartNewRequest ?? false,
            ...paymentResource(result),
          },
        },
      );
}
export function postAiVisibility(ctx: ApiContext, projectId: string) {
  return postAnalysis(ctx, projectId, "visibility");
}
export function postPromptExplorer(ctx: ApiContext, projectId: string) {
  return postAnalysis(ctx, projectId, "prompt");
}

export async function getAiCatalog(ctx: ApiContext, projectId: string) {
  const scope = scopedProject(ctx, projectId);
  if (scope) return scope;
  const result = await getAiResearchCatalog(ctx.auth.project.id);
  return result.ok
    ? dataResponse(snakeizeKeys(result.catalog), { headers: ctx.headers })
    : errorResponse("provider_unavailable", result.message, 422, {
        headers: ctx.headers,
        instance: ctx.instance,
      });
}
