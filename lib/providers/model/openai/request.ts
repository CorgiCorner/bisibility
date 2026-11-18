import { modelColumnSchema, modelPlaygroundDraftSchema } from "@/lib/model-playground/schema";
import { ModelTransportError } from "@/lib/providers/model/errors";
import type { ModelProvider } from "@/lib/providers/model/types";
import { z } from "zod";
import { capability } from "./capabilities";

const request = z
  .object({
    column: modelColumnSchema,
    operationKey: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    prompt: modelPlaygroundDraftSchema.shape.prompt,
    responseLanguage: modelPlaygroundDraftSchema.shape.responseLanguage,
  })
  .strict();

export function prepareRequest(input: Parameters<ModelProvider["generate"]>[1]) {
  const parsed = request.safeParse(input);
  if (!parsed.success) throw new ModelTransportError("invalid_request");
  const value = parsed.data;
  const { column } = value;
  const entry = capability(column.modelId);
  const { search, temperature, maxOutputTokens } = column.settings;
  if (
    column.providerId !== "openai" ||
    !entry ||
    maxOutputTokens > entry.maximum ||
    (temperature !== undefined && !entry.temperature) ||
    !["off", "openai_web_search"].includes(search.mode) ||
    search.countryCode !== undefined
  )
    throw new ModelTransportError("invalid_request");
  const searching = search.mode === "openai_web_search";
  const maxCalls = searching ? (search.maxCalls ?? 1) : 0;
  const body: Record<string, unknown> = {
    model: column.modelId,
    input: value.prompt,
    instructions: `Respond in ${value.responseLanguage}.`,
    max_output_tokens: maxOutputTokens,
    stream: false,
    store: false,
    background: false,
    truncation: "disabled",
    text: { format: { type: "text" } },
    ...(temperature === undefined ? {} : { temperature }),
    ...(entry.alias === "gpt-5" ? { reasoning: { effort: "medium" } } : {}),
    tools: searching ? [{ type: "web_search" }] : [],
    tool_choice: searching ? "auto" : "none",
    ...(searching ? { max_tool_calls: maxCalls, include: ["web_search_call.action.sources"] } : {}),
  };
  return { ...value, body, maxCalls };
}
