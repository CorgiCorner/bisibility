import { modelPlaygroundDraftSchema } from "@/lib/model-playground/schema";
import { ModelTransportError } from "@/lib/providers/model/errors";
import { common } from "@/lib/providers/model/transport-input";
import type { ModelProvider, ModelProviderContext } from "@/lib/providers/model/types";
import { z } from "zod";
import {
  HAIKU_MODEL_ID,
  MAX_SEARCH_CALLS,
  SEARCH_MODE,
  SEARCH_TOOL,
  SUPPORTED_MODEL_IDS,
} from "./capabilities";
import { COUNTRY_CODES } from "./countries";

const requestSchema = z
  .object({
    column: modelPlaygroundDraftSchema.shape.columns.element,
    operationKey: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    prompt: modelPlaygroundDraftSchema.shape.prompt,
    responseLanguage: modelPlaygroundDraftSchema.shape.responseLanguage,
  })
  .strict();

export function buildRequest(
  context: ModelProviderContext,
  input: Parameters<ModelProvider["generate"]>[1],
) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success || !common.safeParse({ providerId: "anthropic", context }).success)
    throw new ModelTransportError("invalid_request");
  const request = parsed.data;
  const { column } = request;
  const { search } = column.settings;
  if (
    column.providerId !== "anthropic" ||
    !SUPPORTED_MODEL_IDS.includes(column.modelId) ||
    (column.modelId === HAIKU_MODEL_ID && search.mode !== "off") ||
    column.settings.temperature !== undefined ||
    (search.mode !== "off" && search.mode !== SEARCH_MODE) ||
    (search.countryCode !== undefined && !COUNTRY_CODES.has(search.countryCode))
  )
    throw new ModelTransportError("invalid_request");
  const body: Record<string, unknown> = {
    model: column.modelId,
    max_tokens: column.settings.maxOutputTokens,
    stream: false,
    system: `Respond in language ${request.responseLanguage}.`,
    messages: [{ role: "user", content: request.prompt }],
  };
  if (column.modelId === HAIKU_MODEL_ID) {
    if (Buffer.byteLength(JSON.stringify(body), "utf8") + 500 > 64_000)
      throw new ModelTransportError("invalid_request");
    body.thinking = { type: "disabled" };
    body.output_config = { effort: "low" };
  }
  if (search.mode === SEARCH_MODE)
    body.tools = [
      {
        type: SEARCH_TOOL,
        name: "web_search",
        allowed_callers: ["direct"],
        max_uses: search.maxCalls ?? MAX_SEARCH_CALLS,
        ...(search.countryCode
          ? { user_location: { type: "approximate", country: search.countryCode } }
          : {}),
      },
    ];
  return { ...request, body };
}
