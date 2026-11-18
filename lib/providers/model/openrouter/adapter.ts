import "server-only";
import { createHash } from "node:crypto";
import { createModelPlaygroundRunSchema } from "@/lib/model-playground/schema";
import { ModelCatalogCache, type ModelCatalogScope } from "@/lib/providers/model/catalog-cache";
import { ModelTransportError } from "@/lib/providers/model/errors";
import { generateModelResponse, readModelMetadata } from "@/lib/providers/model/transport";
import type { ModelProvider, ModelProviderContext } from "@/lib/providers/model/types";
import { z } from "zod";
import { reviewedModel } from "./capabilities";
import { normalizeOpenRouterCatalog } from "./catalog";
import { COST_JSON_OPTIONS } from "./costs";
import { normalizeOpenRouterResponse } from "./normalize";

function scope(context: ModelProviderContext): ModelCatalogScope {
  if (typeof context?.apiKey !== "string") throw new ModelTransportError("invalid_request");
  return {
    providerId: "openrouter",
    accountDigest: context.accountDigest,
    credentialRevision: createHash("sha256").update(context.apiKey).digest("hex"),
  };
}

/** Construction/import is inert. A successful explicit probe is required before generation. */
export function createOpenRouterProvider(): ModelProvider {
  const cache = new ModelCatalogCache();
  return {
    id: "openrouter",
    async probe(context) {
      try {
        const response = await readModelMetadata({ providerId: "openrouter", context });
        const catalog = normalizeOpenRouterCatalog(
          response.body,
          context.accountDigest,
          new Date(),
        );
        cache.set(scope(context), catalog);
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
      const envelope = z
        .object({
          column: z.unknown(),
          operationKey: z.string(),
          prompt: z.string(),
          responseLanguage: z.string(),
        })
        .strict()
        .safeParse(input);
      if (!envelope.success) throw new ModelTransportError("invalid_request");
      const catalog = cache.get(scope(context));
      if (!catalog) throw new ModelTransportError("invalid_request");
      const parsed = createModelPlaygroundRunSchema([catalog], new Date()).safeParse({
        version: 1,
        prompt: input.prompt,
        responseLanguage: input.responseLanguage,
        columns: [input.column],
      });
      if (!parsed.success) throw new ModelTransportError("invalid_request");
      const column = parsed.data.columns[0];
      const search = column.settings.search.mode !== "off";
      const selected = reviewedModel(column.modelId);
      if (!selected) throw new ModelTransportError("invalid_request");
      return generateModelResponse({
        providerId: "openrouter",
        context,
        column,
        operationKey: input.operationKey,
        observer,
        jsonOptions: COST_JSON_OPTIONS,
        body: {
          model: column.modelId,
          stream: false,
          messages: [
            { role: "system", content: `Respond in language ${input.responseLanguage}.` },
            { role: "user", content: parsed.data.prompt },
          ],
          max_completion_tokens: column.settings.maxOutputTokens,
          ...(column.settings.temperature === undefined
            ? {}
            : { temperature: column.settings.temperature }),
          provider: {
            only: [selected.routing.slug],
            order: [selected.routing.slug],
            allow_fallbacks: false,
            require_parameters: true,
          },
          plugins: search ? [{ id: "web", engine: "exa", mode: "auto", max_results: 5 }] : [],
          transforms: [],
        },
        normalize: (response) =>
          normalizeOpenRouterResponse(response.body, search, context.apiKey, column.modelId),
      });
    },
  };
}
