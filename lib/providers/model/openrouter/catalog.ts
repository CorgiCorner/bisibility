import "server-only";
import { modelCatalogSnapshotSchema } from "@/lib/model-playground/schema";
import { MODEL_CATALOG_CACHE_LIMITS } from "@/lib/providers/model/catalog-cache";
import { ModelTransportError } from "@/lib/providers/model/errors";
import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { z } from "zod";
import { CAPABILITY_VERSION, curatedEntry, REVIEWED_MODELS } from "./capabilities";

const metadata = z.object({ data: z.array(z.unknown()).max(10_000) });
const candidate = z.object({
  id: z.string(),
  architecture: z.object({
    input_modalities: z.array(z.string()),
    output_modalities: z.array(z.string()),
  }),
  supported_parameters: z.array(z.string()),
  top_provider: z.object({ max_completion_tokens: z.number().int().min(16) }),
});

/** Account catalog intersection, with no price or paid-access inference. */
export function normalizeOpenRouterCatalog(
  body: unknown,
  accountDigest: string,
  now: Date,
): ModelCatalogSnapshot {
  const parsed = metadata.safeParse(body);
  if (!parsed.success) throw new ModelTransportError("invalid_response");
  const models = REVIEWED_MODELS.flatMap(({ id }) => {
    const matches = parsed.data.data.filter(
      (row) => row !== null && typeof row === "object" && "id" in row && row.id === id,
    );
    const model = matches.length === 1 ? candidate.safeParse(matches[0]) : null;
    if (
      !model?.success ||
      !model.data.architecture.input_modalities.includes("text") ||
      !model.data.architecture.output_modalities.includes("text") ||
      !model.data.supported_parameters.includes("max_tokens")
    )
      return [];
    return [
      curatedEntry(
        Math.min(4096, model.data.top_provider.max_completion_tokens),
        model.data.supported_parameters.includes("temperature"),
        id,
      ),
    ];
  });
  return modelCatalogSnapshotSchema.parse({
    version: 1,
    providerId: "openrouter",
    accountDigest,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MODEL_CATALOG_CACHE_LIMITS.ttlMs).toISOString(),
    capabilityVersion: CAPABILITY_VERSION,
    models,
  });
}
