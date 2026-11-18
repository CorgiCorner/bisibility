import "server-only";
import {
  modelCatalogSnapshotSchema,
  modelColumnSettingsSchema,
} from "@/lib/model-playground/schema";
import { MODEL_CATALOG_CACHE_LIMITS } from "@/lib/providers/model/catalog-cache";
import { ModelTransportError } from "@/lib/providers/model/errors";
import { readModelMetadataPages } from "@/lib/providers/model/transport";
import { common } from "@/lib/providers/model/transport-input";
import {
  modelMetadataEnvelopeSchema,
  modelMetadataIdSchema,
} from "@/lib/providers/model/transport-metadata";
import type { ModelProbeResult, ModelProviderContext } from "@/lib/providers/model/types";
import { z } from "zod";
import { CAPABILITY_VERSION, capability, SUPPORTED_MODEL_IDS } from "./capabilities";

const rowSchema = z.object({
  type: z.literal("model"),
  id: modelMetadataIdSchema,
  max_tokens: z.number().int().positive().nullable().optional(),
  lifecycle: z.enum(["active", "deprecated", "retired"]).optional(),
  capabilities: z
    .object({
      server_tools: z.object({ web_search: z.object({ supported: z.boolean() }) }).optional(),
    })
    .nullable()
    .optional(),
});

/** Single-page fixture projection; nonterminal pages are never complete catalogs. */
export function catalogFromPage(body: unknown, accountDigest: string, workspaceId?: string) {
  const page = modelMetadataEnvelopeSchema.safeParse(body);
  if (!page.success) throw new ModelTransportError("invalid_response");
  const { data, has_more, first_id, last_id } = page.data;
  if (
    has_more ||
    data.some((model) => !modelMetadataIdSchema.safeParse(model.id).success) ||
    new Set(data.map((model) => model.id)).size !== data.length ||
    first_id !== (data[0]?.id ?? null) ||
    last_id !== (data.at(-1)?.id ?? null)
  )
    throw new ModelTransportError("invalid_response");
  return catalogFromModels(data, accountDigest, workspaceId);
}

/** Maps only the complete bounded traversal returned by the shared transport. */
function catalogFromModels(
  models: Record<string, unknown>[],
  accountDigest: string,
  workspaceId?: string,
) {
  let skippedEntries = 0;
  const data: z.infer<typeof rowSchema>[] = [];
  for (const value of models) {
    const row = rowSchema.safeParse(value);
    if (row.success) data.push(row.data);
    else if (SUPPORTED_MODEL_IDS.includes(String(value.id)))
      throw new ModelTransportError("invalid_response");
    else skippedEntries++;
  }
  const selectedModels = SUPPORTED_MODEL_IDS.flatMap((modelId) => {
    const selected = data.find((model) => model.id === modelId && model.lifecycle !== "retired");
    if (!selected) return [];
    const model = capability(
      selected.capabilities?.server_tools?.web_search.supported === true,
      modelId,
    );
    if (typeof selected.max_tokens === "number")
      model.maxOutputTokens = Math.min(model.maxOutputTokens, selected.max_tokens);
    return modelColumnSettingsSchema.shape.maxOutputTokens.safeParse(model.maxOutputTokens).success
      ? [model]
      : [];
  });
  const fetchedAt = Date.now();
  const catalog = modelCatalogSnapshotSchema.safeParse({
    version: 1,
    providerId: "anthropic",
    accountDigest,
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    recognition: {
      traversal: "complete",
      recognition: skippedEntries ? "partial" : "complete",
      skippedEntries,
    },
    fetchedAt: new Date(fetchedAt).toISOString(),
    expiresAt: new Date(fetchedAt + MODEL_CATALOG_CACHE_LIMITS.ttlMs).toISOString(),
    capabilityVersion: CAPABILITY_VERSION,
    models: selectedModels,
  });
  if (!catalog.success) throw new ModelTransportError("invalid_response");
  return catalog.data;
}

export async function probe(context: ModelProviderContext): Promise<ModelProbeResult> {
  if (!common.safeParse({ providerId: "anthropic", context }).success)
    throw new ModelTransportError("invalid_request");
  try {
    const response = await readModelMetadataPages({ providerId: "anthropic", context });
    const catalog = catalogFromModels(response.models, context.accountDigest, context.workspaceId);
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
      ...(error instanceof ModelTransportError && error.workspaceIssue
        ? { workspaceIssue: error.workspaceIssue }
        : {}),
    };
  }
}
