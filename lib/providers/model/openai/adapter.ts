import "server-only";
import { generateModelResponse } from "@/lib/providers/model/transport";
import type { ModelProvider } from "@/lib/providers/model/types";
import { probeOpenAI } from "./catalog";
import { normalizeResponse } from "./normalize";
import { prepareRequest } from "./request";

export const openAIModelProvider: ModelProvider = {
  id: "openai",
  probe: probeOpenAI,
  async generate(context, input, observer) {
    const prepared = prepareRequest(input);
    return generateModelResponse({
      providerId: "openai",
      context,
      column: prepared.column,
      operationKey: prepared.operationKey,
      body: prepared.body,
      observer,
      normalize: (response) => normalizeResponse(response.body, prepared.column, prepared.maxCalls),
    });
  },
};
