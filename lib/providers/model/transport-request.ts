import "server-only";
import { ModelTransportError, statusErrorCode } from "./errors";
import { openRouterGenerationId } from "./generation-id";
import type { ModelDeadline } from "./transport-deadline";
import {
  discardModelResponse,
  type ModelResponseBudget,
  type ModelTransportResponse,
  readModelJson,
  safeModelRequestId,
  safeModelWorkspaceId,
} from "./transport-io";
import type { ModelJsonOptions } from "./transport-json";
import type { NativeModelProviderId } from "./types";

const ROUTES = {
  openai: { origin: "https://api.openai.com", metadata: "/v1/models", generation: "/v1/responses" },
  anthropic: {
    origin: "https://api.anthropic.com",
    metadata: "/v1/models",
    generation: "/v1/messages",
  },
  openrouter: {
    origin: "https://openrouter.ai",
    metadata: "/api/v1/models",
    generation: "/api/v1/chat/completions",
  },
  vercel_ai_gateway: {
    origin: "https://ai-gateway.vercel.sh",
    metadata: "/v1/models",
    generation: "/v1/chat/completions",
  },
} as const;

export async function modelRequest(input: {
  providerId: NativeModelProviderId;
  classification: "metadata" | "generation";
  apiKey: string;
  workspaceId?: string;
  body?: string;
  maxBytes: number;
  deadline: ModelDeadline;
  query?: string;
  jsonOptions?: ModelJsonOptions;
  budget?: ModelResponseBudget;
}): Promise<ModelTransportResponse> {
  const route = ROUTES[input.providerId];
  const headers: Record<string, string> =
    input.providerId === "anthropic"
      ? { "x-api-key": input.apiKey, "anthropic-version": "2026-10-21" }
      : { authorization: `Bearer ${input.apiKey}` };
  if (input.providerId === "anthropic" && input.workspaceId !== undefined)
    headers["anthropic-workspace-id"] = input.workspaceId;
  let id: string | null = null;
  let generationId: string | null = null;
  let received: Response | undefined;
  try {
    const response = await input.deadline.run(async () => {
      const result = await fetch(
        `${route.origin}${route[input.classification]}${input.query ?? ""}`,
        {
          method: input.classification === "metadata" ? "GET" : "POST",
          headers: { ...headers, accept: "application/json", "content-type": "application/json" },
          ...(input.body === undefined ? {} : { body: input.body }),
          redirect: "error",
          cache: "no-store",
          signal: input.deadline.signal,
        },
      ).catch(() => {
        input.deadline.check();
        throw new ModelTransportError("network_error");
      });
      received = result;
      if (input.deadline.signal.aborted) discardModelResponse(result);
      return result;
    });
    id = safeModelRequestId(response, input.apiKey, input.body);
    if (response.redirected || response.status < 200 || response.status >= 300) {
      discardModelResponse(response);
      const workspaceIssue =
        input.providerId === "anthropic"
          ? response.status === 400
            ? input.workspaceId === undefined
              ? "selection_missing"
              : "selection"
            : response.status === 404 && input.workspaceId !== undefined
              ? "access"
              : undefined
          : undefined;
      throw new ModelTransportError(
        statusErrorCode(response.status),
        false,
        null,
        workspaceIssue,
        response.status,
      );
    }
    const body = await readModelJson(
      response,
      input.maxBytes,
      input.deadline,
      input.jsonOptions,
      input.budget,
      input.providerId === "openrouter" && input.classification === "generation"
        ? (prefix) => {
            const candidate = openRouterGenerationId(prefix);
            if (
              candidate &&
              !candidate.includes(input.apiKey) &&
              !input.apiKey.includes(candidate) &&
              !input.body?.includes(candidate)
            )
              generationId = candidate;
          }
        : undefined,
    );
    return {
      body,
      requestId: generationId ?? id,
      ...(input.providerId === "anthropic"
        ? { resolvedWorkspaceId: safeModelWorkspaceId(response, input.apiKey) }
        : {}),
    };
  } catch (error) {
    if (received) discardModelResponse(received);
    throw new ModelTransportError(
      error instanceof ModelTransportError ? error.code : "invalid_response",
      false,
      generationId ?? id,
      error instanceof ModelTransportError ? error.workspaceIssue : undefined,
      error instanceof ModelTransportError ? error.httpStatus : undefined,
    );
  }
}
