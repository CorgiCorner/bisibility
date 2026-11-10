import type { ProviderCredentials } from "@/lib/providers/types";
import type { SerpApiResponse } from "./serpapi-payload";
import {
  requestJson,
  SERP_API_SEARCH_TIMEOUT_MS,
  SerpApiError,
  serpApiOverviewRequest,
} from "./serpapi-request";
import { serpApiUsageReceipt } from "./usage-receipts";

type Row = Record<string, unknown>;
function record(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}
function hasContent(overview: Row): boolean {
  let rows: unknown[] = Array.isArray(overview.text_blocks)
    ? overview.text_blocks.slice(0, 100)
    : [];
  for (let depth = 0; depth < 4; depth++) {
    if (
      rows.some((row) => {
        const value = record(row);
        return [value?.snippet, value?.text].some(
          (text) => typeof text === "string" && text.trim(),
        );
      })
    )
      return true;
    rows = rows
      .flatMap((row) => {
        const value = record(row);
        return [value?.list, value?.text_blocks, value?.items].flatMap((items) =>
          Array.isArray(items) ? items.slice(0, 100) : [],
        );
      })
      .slice(0, 200);
  }
  return false;
}
/** Called only after explicit consent, immediately after the Google response while its token is valid. */
export async function completeSerpApiOverview(
  page: SerpApiResponse,
  credentials: ProviderCredentials,
  apiKey: string,
) {
  const overview = record((page as Row).ai_overview);
  const token = overview?.page_token;
  if (!overview || hasContent(overview) || typeof token !== "string" || !token) return null;
  const request = serpApiOverviewRequest(token, apiKey);
  let native: SerpApiResponse;
  try {
    native = await requestJson(request.url, credentials, SERP_API_SEARCH_TIMEOUT_MS, 1);
  } catch (error) {
    if (error instanceof SerpApiError)
      throw new SerpApiError(error.message.split(token).join("[redacted]"), error.retryable);
    throw error;
  }
  return {
    native,
    quantity: serpApiUsageReceipt(native, { ok: true }).quantity,
    overview: record((native as Row).ai_overview),
  };
}
