import { captureHttpResponse } from "@/lib/providers/provider-response";
import "server-only";

import { recordFreeUsage } from "@/lib/analytics/request-usage-context";
import type { ProviderCredentials } from "@/lib/providers/types";
import { z } from "zod";

export const DOMAIN_RATING_VERSION = "dr3";
export const DOMAIN_RATING_LICENSE = "https://ahrefs.com/legal/domain-rating-license";
const responseSchema = z.object({
  domain_rating: z.object({ domain_rating: z.number().finite().min(0).max(100) }),
});

export class DomainRatingError extends Error {
  constructor(
    readonly code: "authentication" | "rate_limited" | "unavailable" | "invalid_response",
  ) {
    super(code);
    this.name = "DomainRatingError";
  }
}

export async function fetchDomainRating(
  domain: string,
  apiKey: string,
  capture?: ProviderCredentials["captureResponse"],
): Promise<number> {
  const url = new URL("https://api.ahrefs.com/v3/public/domain-rating-free");
  url.search = new URLSearchParams({
    target: domain,
    version: DOMAIN_RATING_VERSION,
    output: "json",
  }).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new DomainRatingError("unavailable");
  }
  await captureHttpResponse(response, capture, url.href);
  const payload = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403)
    throw new DomainRatingError("authentication");
  if (response.status === 429) throw new DomainRatingError("rate_limited");
  if (!response.ok) throw new DomainRatingError("unavailable");
  try {
    const rating = responseSchema.parse(payload).domain_rating.domain_rating;
    recordFreeUsage("ahrefs");
    return rating;
  } catch {
    throw new DomainRatingError("invalid_response");
  }
}

export const ahrefsProvider = {
  id: "ahrefs",
  label: "Ahrefs",
  async testConnection(credentials: ProviderCredentials) {
    if (!credentials.apiKey) return { ok: false, message: "An API key is required." };
    try {
      await fetchDomainRating("example.com", credentials.apiKey);
      return { ok: true, message: "Connected." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof DomainRatingError ? error.code : "unavailable",
      };
    }
  },
};
