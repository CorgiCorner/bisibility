import "server-only";
import { modelCatalogSnapshotSchema, modelIdSchema } from "@/lib/model-playground/schema";
import { MODEL_CATALOG_CACHE_LIMITS } from "@/lib/providers/model/catalog-cache";
import { ModelTransportError } from "@/lib/providers/model/errors";
import { readModelMetadata } from "@/lib/providers/model/transport";
import type { ModelProbeResult, ModelProviderContext } from "@/lib/providers/model/types";
import { z } from "zod";
import { CAPABILITY_VERSION, catalogEntry } from "./capabilities";

const metadata = z.object({
  object: z.literal("list"),
  data: z.array(z.object({ id: modelIdSchema, object: z.literal("model") })).max(10000),
});

/** Invoked only by authorized connection code; import and construction perform no I/O. */
export async function probeOpenAI(context: ModelProviderContext): Promise<ModelProbeResult> {
  try {
    const response = await readModelMetadata({ providerId: "openai", context });
    const parsed = metadata.safeParse(response.body);
    if (!parsed.success) return { state: "unavailable", catalog: null };
    const models = [...new Set(parsed.data.data.map((item) => item.id))]
      .map(catalogEntry)
      .filter((item) => item !== null);
    if (!models.length) return { state: "no_supported_models", catalog: null };
    const now = Date.now();
    const catalog = modelCatalogSnapshotSchema.parse({
      version: 1,
      providerId: "openai",
      accountDigest: context.accountDigest,
      fetchedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + MODEL_CATALOG_CACHE_LIMITS.ttlMs).toISOString(),
      capabilityVersion: CAPABILITY_VERSION,
      models,
    });
    return { state: "catalog_available", catalog };
  } catch (error) {
    return {
      state:
        error instanceof ModelTransportError && error.code === "invalid_credentials"
          ? "invalid_key"
          : "unavailable",
      catalog: null,
    };
  }
}
