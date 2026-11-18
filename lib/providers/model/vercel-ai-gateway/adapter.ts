import "server-only";
import { modelColumnSchema, modelPlaygroundDraftSchema } from "@/lib/model-playground/schema";
import { ModelTransportError } from "@/lib/providers/model/errors";
import { generateModelResponse, readModelMetadata } from "@/lib/providers/model/transport";
import type { ModelProvider } from "@/lib/providers/model/types";
import { z } from "zod";
import { normalizeCatalog, providerId, textCapability } from "./catalog";
import { normalizeResponse } from "./normalize";

const generationInput = z
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

export const vercelAiGatewayProvider: ModelProvider = {
  id: providerId,
  async probe(context) {
    try {
      const response = await readModelMetadata({ providerId, context });
      const catalog = normalizeCatalog(response.body, context.accountDigest);
      return catalog.models.length
        ? { state: "catalog_available", catalog }
        : { state: "no_supported_models", catalog: null };
    } catch (error) {
      return {
        state:
          error instanceof ModelTransportError && error.code === "invalid_credentials"
            ? "invalid_key"
            : "unavailable",
        catalog: null,
      };
    }
  },
  async generate(context, input, observer) {
    const parsed = generationInput.safeParse(input);
    if (!parsed.success) throw new ModelTransportError("invalid_request");
    const { column, operationKey, prompt, responseLanguage } = parsed.data;
    const capability = textCapability();
    if (
      column.providerId !== providerId ||
      column.modelId !== capability.modelId ||
      column.settings.maxOutputTokens > capability.maxOutputTokens ||
      column.settings.temperature !== undefined ||
      column.settings.search.mode !== "off"
    )
      throw new ModelTransportError("invalid_request");
    return generateModelResponse({
      providerId,
      context,
      column,
      operationKey,
      observer,
      body: {
        model: column.modelId,
        messages: [
          { role: "system", content: `Respond in language ${responseLanguage}.` },
          { role: "user", content: prompt },
        ],
        max_tokens: column.settings.maxOutputTokens,
        stream: false,
        ...(column.settings.allowedProviders
          ? { providerOptions: { gateway: { only: column.settings.allowedProviders } } }
          : {}),
      },
      normalize: (response) =>
        normalizeResponse(
          response,
          column.modelId,
          context.apiKey,
          column.settings.allowedProviders,
        ),
    });
  },
};
