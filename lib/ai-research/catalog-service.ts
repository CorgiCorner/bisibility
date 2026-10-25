import "server-only";
import { createHash } from "node:crypto";
import { redactOpsText } from "@/lib/ops/redact-text";
import { withProviderLookupCache } from "@/lib/provider-lookups/cache";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { resolveConnectionCredentials } from "@/lib/providers/connection-credentials";
import { fetchAiResearchCapabilities, fetchEngineModelCatalog } from "./catalog";
import { AI_RESEARCH_CATALOG_CACHE_TTL_SECONDS } from "./catalog-freshness";
import type { AiCatalogOutcome } from "./catalog-types";
import { requireAiSource } from "./context";
import { engineOptions } from "./engine-bounds";
import type { AiEngine } from "./engines";

async function catalogCredentials(
  source: Awaited<ReturnType<typeof requireAiSource>>,
  purpose?: "free_catalog",
) {
  const credentials = purpose
    ? await resolveConnectionCredentials(source.connection, purpose)
    : await resolveConnectionCredentials(source.connection);
  if (!credentials?.login || !credentials.password)
    throw new ProviderLookupSignal({ ok: false, reason: "no_source" });
  return credentials;
}

export async function loadAiResearchCapabilities(
  source: Awaited<ReturnType<typeof requireAiSource>>,
  deadlineAt = Date.now() + 10_000,
) {
  // Admission pricing must use its bound account, never a free catalog pool member.
  return fetchAiResearchCapabilities(await catalogCredentials(source), deadlineAt);
}
/** Free per-engine catalog through the free-catalog credential, never a paid pool member. */
export async function loadEngineCatalog(
  source: Awaited<ReturnType<typeof requireAiSource>>,
  engine: AiEngine,
  deadlineAt = Date.now() + 10_000,
) {
  return fetchEngineModelCatalog(
    await catalogCredentials(source, "free_catalog"),
    engine,
    deadlineAt,
  );
}
/** Engine-mode picker options: Credits (hosted) connections only, fresh calibrations only. */
export async function getPromptEngineOptions(projectId: string) {
  try {
    const source = await requireAiSource(projectId);
    return source.connection.credentialSource === "hosted" ? engineOptions() : [];
  } catch {
    return [];
  }
}
export async function getAiResearchCatalog(projectId: string): Promise<AiCatalogOutcome> {
  try {
    const source = await requireAiSource(projectId);
    const credentials = await catalogCredentials(source, "free_catalog");
    const credentialIdentity = createHash("sha256")
      .update(
        `${source.connection.credentialSource}:${source.connection.credentialsEncrypted ?? ""}`,
      )
      .digest("hex");
    const read = () =>
      withProviderLookupCache({
        fresh: false,
        key: `ai-catalog:v1:${projectId}:${source.connection.id}:${credentialIdentity}`,
        ttlSeconds: AI_RESEARCH_CATALOG_CACHE_TTL_SECONDS,
        lockTtlSeconds: 30,
        load: async () =>
          (await fetchAiResearchCapabilities(credentials, Date.now() + 10_000)).catalog,
      });
    // A page request and its parallel render share this key. The waiter polls for about
    // 10 seconds, as long as the holder's fetch deadline, so it can give up just before the
    // holder writes the catalog. One more read picks up that result or takes the lock.
    let loaded = await read();
    if (loaded.status === "contended") loaded = await read();
    if (loaded.status === "contended")
      console.warn("[ai-research] catalog load still contended after retry", { projectId });
    return loaded.status === "contended"
      ? {
          ok: false,
          reason: "contended",
          message: "The provider catalog is already being refreshed. Retry shortly.",
        }
      : {
          ok: true,
          catalog: {
            ...loaded.value,
            actualCostAvailable: source.connection.credentialSource === "own",
          },
        };
  } catch (error) {
    if (error instanceof ProviderLookupSignal && error.outcome.reason === "no_source")
      return {
        ok: false,
        reason: "no_source",
        message: "Connect a compatible provider in Integrations to load its AI catalog.",
      };
    console.error("[ai-research] free catalog load failed", {
      projectId,
      name: error instanceof Error ? error.name : typeof error,
      error: redactOpsText(error instanceof Error ? error.message : String(error), 500),
    });
    return {
      ok: false,
      reason: "provider_unavailable",
      message:
        "The provider's free model and market catalog could not be loaded. Connect a compatible provider in Integrations and retry.",
    };
  }
}
