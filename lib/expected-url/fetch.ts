import type { PublicDocumentFetchOptions } from "./public-document-fetch";
import { fetchPublicDocument } from "./public-document-fetch";
import type { ExpectedUrlCache, ExpectedUrlDocument, ExpectedUrlLogger } from "./types";

const BODY_LIMIT = 1_048_576;
const CACHE_WINDOW_MS = 300_000;

export type FetchExpectedUrlDocumentInput = {
  allowedHosts?: readonly string[];
  cache: ExpectedUrlCache;
  fetcher?: PublicDocumentFetchOptions["fetcher"];
  logger: ExpectedUrlLogger;
  lookup?: PublicDocumentFetchOptions["lookup"];
  projectId: string;
  timeoutMs?: number;
  url: string;
};

export async function fetchExpectedUrlDocument(
  input: FetchExpectedUrlDocumentInput,
): Promise<ExpectedUrlDocument | null> {
  const key = `${input.projectId}:${input.url}:${input.allowedHosts?.join(",") ?? ""}`;
  const cached = input.cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const value = await fetchPublicDocument({
      allowedHosts: input.allowedHosts,
      fetcher: input.fetcher,
      lookup: input.lookup,
      maxBytes: BODY_LIMIT,
      timeoutMs: input.timeoutMs ?? 5_000,
      url: input.url,
      contentTypes: ["text/html", "application/xhtml+xml", "application/xml", "text/xml"],
    });
    input.cache.set(key, { expiresAt: Date.now() + CACHE_WINDOW_MS, value });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.logger({
      reason: message.includes("exceeds") ? "body_too_large" : "fetch_failed",
      projectId: input.projectId,
    });
    return null;
  }
}
