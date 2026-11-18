import "server-only";
import { generateModelResponse } from "@/lib/providers/model/transport";
import type { ModelProvider } from "@/lib/providers/model/types";
import { probe } from "./catalog";
import { normalizeResponse } from "./normalize";
import { buildRequest } from "./request";

/** P12 must bind the current account catalog; P09 owns durable admission/settlement. */
export const anthropicModelProvider: ModelProvider = {
  id: "anthropic",
  probe,
  async generate(context, input, observer) {
    const request = buildRequest(context, input);
    return generateModelResponse({
      providerId: "anthropic",
      context,
      column: request.column,
      operationKey: request.operationKey,
      body: request.body,
      observer,
      normalize: (response) => normalizeResponse(response, request.column, context.apiKey),
    });
  },
};
