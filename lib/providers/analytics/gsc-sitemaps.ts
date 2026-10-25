import type { ProviderCredentials } from "@/lib/providers/types";
import { googleApiFetch, refreshGoogleAccessToken, stringValue } from "./google-client";
import { readGscCredentials } from "./gsc-credentials";
import { assertGscProperty, assertGscPropertyUrl } from "./gsc-property-membership";
import { gscFetchContext } from "./gsc-search-analytics";

export type GscSitemapStatus = {
  contents: Array<{ submitted: number; type: string }>;
  errors: number;
  isPending: boolean;
  isSitemapsIndex: boolean;
  lastDownloaded: string | null;
  lastSubmitted: string | null;
  path: string;
  type: string | null;
  warnings: number;
};

type WmxSitemap = {
  contents?: Array<{ submitted?: unknown; type?: unknown; indexed?: unknown }>;
  errors?: unknown;
  isPending?: unknown;
  isSitemapsIndex?: unknown;
  lastDownloaded?: unknown;
  lastSubmitted?: unknown;
  path?: unknown;
  type?: unknown;
  warnings?: unknown;
};

function numberValue(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeGscSitemap(data: WmxSitemap, fallbackPath = ""): GscSitemapStatus {
  return {
    // Google deprecated indexed; explicitly project only supported fields.
    contents: (data.contents ?? []).map((entry) => ({
      submitted: numberValue(entry.submitted),
      type: stringValue(entry.type) ?? "web",
    })),
    errors: numberValue(data.errors),
    isPending: data.isPending === true,
    isSitemapsIndex: data.isSitemapsIndex === true,
    lastDownloaded: stringValue(data.lastDownloaded),
    lastSubmitted: stringValue(data.lastSubmitted),
    path: stringValue(data.path) ?? fallbackPath,
    type: stringValue(data.type),
    warnings: numberValue(data.warnings),
  };
}

export async function fetchGscSitemaps(creds: ProviderCredentials, path?: string) {
  const { property, refreshToken } = readGscCredentials(creds);
  assertGscProperty(property);
  if (path !== undefined) assertGscPropertyUrl(property, path);
  const accessToken = await refreshGoogleAccessToken(refreshToken, creds.onRefreshToken);
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps`;
  const data = await googleApiFetch<WmxSitemap & { sitemap?: WmxSitemap[] }>(
    path === undefined ? base : `${base}/${encodeURIComponent(path)}`,
    accessToken,
    {},
    gscFetchContext(creds, property),
  );
  return path === undefined
    ? (data.sitemap ?? []).map((entry) => normalizeGscSitemap(entry))
    : [normalizeGscSitemap(data, path)];
}
