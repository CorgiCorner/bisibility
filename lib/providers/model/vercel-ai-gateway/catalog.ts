import { modelCatalogSnapshotSchema } from "@/lib/model-playground/schema";
import { MODEL_CATALOG_CACHE_LIMITS } from "@/lib/providers/model/catalog-cache";
import { ModelTransportError } from "@/lib/providers/model/errors";
import type { ModelCatalogEntry, ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { z } from "zod";

export const providerId = "vercel_ai_gateway" as const;
export const capabilityVersion = "gateway-chat-text-20261112-v1";
export const textModelId = "anthropic/claude-sonnet-5";

export function textCapability(): ModelCatalogEntry {
  return {
    providerId,
    modelId: textModelId,
    sourceKind: "raw_model",
    protocol: "chat_completions",
    capabilityVersion,
    availability: "fixture_verified",
    text: {
      documentationUrl:
        "https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions",
      reviewedAt: "2026-11-12T00:00:00.000Z",
      fixtureRevision: "gateway-synthetic-text-v1",
    },
    maxOutputTokens: 4096,
    temperature: false,
    search: [],
  };
}

const catalogResponse = z.object({
  object: z.literal("list"),
  data: z.array(z.object({ id: z.string() }).passthrough()).max(10000),
  has_more: z.boolean().optional(),
});

/** The fixed public list cannot verify a key, team admission or paid entitlement. */
export function normalizeCatalog(
  body: unknown,
  accountDigest: string,
  now = new Date(),
): ModelCatalogSnapshot {
  const parsed = catalogResponse.safeParse(body);
  if (!parsed.success || parsed.data.has_more === true)
    throw new ModelTransportError("invalid_response");
  const rows = parsed.data.data.filter((row) => row.id === textModelId);
  if (rows.length > 1) throw new ModelTransportError("invalid_response");
  const row = rows[0];
  const capability = textCapability();
  let supported = row !== undefined;
  if (row) {
    if (row.type !== undefined && row.type !== "language") supported = false;
    if (row.modalities !== undefined) {
      const modalities = z
        .object({ input: z.array(z.string()), output: z.array(z.string()) })
        .safeParse(row.modalities);
      supported &&=
        modalities.success &&
        modalities.data.input.includes("text") &&
        modalities.data.output.includes("text");
    }
    if (row.model_eligibility !== undefined) {
      const eligibility = z
        .object({ status: z.literal("eligible") })
        .safeParse(row.model_eligibility);
      supported &&= eligibility.success;
    }
    if (row.max_tokens !== undefined) {
      const limit = z
        .number()
        .int()
        .positive()
        .max(Number.MAX_SAFE_INTEGER)
        .safeParse(row.max_tokens);
      if (!limit.success || limit.data < 16) supported = false;
      else capability.maxOutputTokens = Math.min(capability.maxOutputTokens, limit.data);
    }
  }
  return modelCatalogSnapshotSchema.parse({
    version: 1,
    providerId,
    accountDigest,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MODEL_CATALOG_CACHE_LIMITS.ttlMs).toISOString(),
    capabilityVersion,
    models: supported ? [capability] : [],
  });
}
