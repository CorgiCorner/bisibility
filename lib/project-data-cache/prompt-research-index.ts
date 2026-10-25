import "server-only";
import { writeProviderLookupCache } from "@/lib/provider-lookups/cache";

/** Project-scoped pointers expose only results already opened in that project. */
export async function indexPromptResearchCache(
  projectId: string,
  cacheKey: string,
  value: { fetchedAt: string; keyword: string; reportId: string },
  ttlSeconds: number,
) {
  const hash = /^ai:prompt-research-v2:([a-f0-9]{64})$/.exec(cacheKey)?.[1];
  const remaining = Math.ceil((Date.parse(value.fetchedAt) - Date.now()) / 1000) + ttlSeconds;
  if (!hash || !/^[a-zA-Z0-9_-]+$/.test(projectId) || !Number.isFinite(remaining) || remaining <= 0)
    return;
  await writeProviderLookupCache(
    `ai:prompt-research-project-v2:${projectId}:${hash}`,
    value,
    remaining,
  );
}
