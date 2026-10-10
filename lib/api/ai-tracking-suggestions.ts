import "server-only";
import {
  generateModelSuggestions,
  previewModelSuggestions,
} from "@/lib/ai-tracking/suggestions/generation";
import {
  modelSuggestionsGenerateInputSchema,
  modelSuggestionsPreviewInputSchema,
  SuggestionGenerationError,
} from "@/lib/ai-tracking/suggestions/generation-schema";
import type { Actor } from "@/lib/auth/authorize";
import { z } from "zod";
import { auditTrackingGeneration } from "./ai-tracking-audit";
import { trackingSnakeizeKeys } from "./ai-tracking-keys";
import type { ApiContext } from "./context";
import { providerOrigin } from "./request-origin";
import { dataResponse, errorResponse } from "./responses";

/** Membership and declared read/write scope are checked by the tracking route before delegation. */
export async function handleAiTrackingSuggestionGeneration(
  ctx: ApiContext,
  actor: Actor,
  project: { id: string; publicId: string },
  member: string,
  body: unknown,
): Promise<Response | null> {
  if (ctx.method !== "POST" || !["preview", "generate"].includes(member)) return null;
  const context = { projectId: project.id, actorId: actor.id, origin: providerOrigin(ctx.origin) };
  try {
    if (member === "preview") {
      const input = modelSuggestionsPreviewInputSchema.parse(body);
      return dataResponse(trackingSnakeizeKeys(await previewModelSuggestions(context, input)), {
        headers: ctx.headers,
      });
    }
    const key = ctx.req.headers.get("Idempotency-Key");
    if (!key || !z.uuid().safeParse(key).success)
      return errorResponse("bad_request", "A stable UUID Idempotency-Key is required.", 400, {
        headers: ctx.headers,
      });
    const input = modelSuggestionsGenerateInputSchema.parse(body);
    const result = await generateModelSuggestions(context, input, key);
    await auditTrackingGeneration(actor, project, result.generationId);
    return dataResponse(trackingSnakeizeKeys(result), {
      headers: ctx.headers,
    });
  } catch (error) {
    if (error instanceof SuggestionGenerationError)
      return errorResponse(
        error.status === 409 ? "conflict" : "validation_failed",
        error.message,
        error.status,
        {
          headers: ctx.headers,
          details: {
            reason: error.reason,
            ...(error.generationId && /^asg_[a-z][a-z0-9]{23}$/.test(error.generationId)
              ? { generation_id: error.generationId }
              : {}),
          },
        },
      );
    throw error;
  }
}
