import "server-only";
import { createHash } from "node:crypto";
import { withProviderLookupCache } from "@/lib/provider-lookups/cache";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { resolveConnectionCredentials } from "@/lib/providers/connection-credentials";
import { fetchAiResearchCapabilities } from "./catalog";
import type { AiCatalogOutcome } from "./catalog-types";
import { requireAiSource } from "./context";

export async function loadAiResearchCapabilities(
  source: Awaited<ReturnType<typeof requireAiSource>>,
  deadlineAt = Date.now() + 10_000,
) {
  const credentials = await resolveConnectionCredentials(source.connection);
  if (!credentials) throw new ProviderLookupSignal({ ok: false, reason: "no_source" });
  return fetchAiResearchCapabilities(credentials, deadlineAt);
}
export async function getAiResearchCatalog(projectId: string): Promise<AiCatalogOutcome> {
  try {
    const source = await requireAiSource(projectId);
    const credentialIdentity = createHash("sha256")
      .update(
        `${source.connection.credentialSource}:${source.connection.credentialsEncrypted ?? ""}`,
      )
      .digest("hex");
    const loaded = await withProviderLookupCache({
      fresh: false,
      key: `ai-catalog:v1:${projectId}:${source.connection.id}:${credentialIdentity}`,
      ttlSeconds: 300,
      lockTtlSeconds: 30,
      load: async () => (await loadAiResearchCapabilities(source)).catalog,
    });
    return loaded.status === "contended"
      ? { ok: false, message: "The provider catalog is already being refreshed. Retry shortly." }
      : {
          ok: true,
          catalog: {
            ...loaded.value,
            actualCostAvailable: source.connection.credentialSource === "own",
          },
        };
  } catch {
    return {
      ok: false,
      message:
        "The provider's free model and market catalog could not be loaded. Connect a compatible provider in Integrations and retry.",
    };
  }
}
