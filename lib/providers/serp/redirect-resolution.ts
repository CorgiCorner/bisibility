import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { isGoogleRedirectUrl } from "./google-redirect";

export type RedirectMapping = { goto?: unknown; url?: unknown };
export type RedirectTransport = (urls: readonly string[]) => Promise<readonly RedirectMapping[]>;
export type RedirectRow = { type?: string; url?: string; domain?: string };
export type RedirectResolution = {
  originalUrl: string | null;
  status: "not_redirect" | "resolved" | "unresolved";
  url: string | null;
};

/** Mirrors the redirect guard of the organic decision: every such row is indeterminate. */
export function isRedirectRow(value: unknown): value is RedirectRow & { url: string } {
  const row = rowValue(value);
  return row?.type === "organic" && typeof row.url === "string" && isGoogleRedirectUrl(row.url);
}

/** Absolute https google.com /goto links are the only form the converter accepts. */
export function isResolvableRedirect(value: unknown): value is string {
  if (typeof value !== "string" || !isGoogleRedirectUrl(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "google.com" || url.hostname === "www.google.com") &&
      (url.pathname === "/goto" || url.pathname === "/goto/")
    );
  } catch {
    return false;
  }
}

function destination(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !isGoogleRedirectUrl(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function rowValue(value: unknown): RedirectRow | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RedirectRow)
    : null;
}

function resolvableUrls(rows: readonly unknown[]) {
  return [
    ...new Set(
      rows.flatMap((value) => {
        const row = rowValue(value);
        return row?.type === "organic" && isResolvableRedirect(row.url) ? [row.url] : [];
      }),
    ),
  ];
}

function applyMappings<T>(
  rows: readonly T[],
  urls: readonly string[],
  mappings: ReadonlyMap<string, string>,
  failed: boolean,
) {
  const resolutions: RedirectResolution[] = rows.map((value) => {
    if (!isRedirectRow(value)) return { originalUrl: null, status: "not_redirect", url: null };
    // A redirect the converter cannot accept stays unresolved, so the decision guard still applies.
    const resolved = isResolvableRedirect(value.url) ? (mappings.get(value.url) ?? null) : null;
    return { originalUrl: value.url, status: resolved ? "resolved" : "unresolved", url: resolved };
  });
  const candidates = mappings.size
    ? rows.map((value, index) => {
        const url = resolutions[index]?.url;
        if (!rowValue(value) || !url) return value;
        return { ...(value as T & RedirectRow), url, domain: new URL(url).hostname };
      })
    : rows;
  return {
    candidates,
    failed,
    mappings: Object.fromEntries(mappings),
    resolutions,
    /** Whether another conversion could still resolve a row. */
    retryable: urls.some((url) => !mappings.has(url)),
  };
}

export type RedirectRowsResolution<T> = ReturnType<typeof applyMappings<T>>;

/** Describes redirect rows without converting them; candidates are the original rows. */
export function unresolvedRows<T>(rows: readonly T[]): RedirectRowsResolution<T> {
  return applyMappings(rows, resolvableUrls(rows), new Map(), false);
}

export async function resolveRedirectRows<T>(
  rows: readonly T[],
  transport: RedirectTransport,
  previous: Readonly<Record<string, string>> = {},
): Promise<RedirectRowsResolution<T>> {
  const urls = resolvableUrls(rows);
  const mappings = new Map<string, string>();
  for (const url of urls) {
    const resolved = destination(previous[url]);
    if (resolved) mappings.set(url, resolved);
  }
  const remaining = urls.filter((url) => !mappings.has(url));
  let failed = false;
  for (let offset = 0; offset < remaining.length; offset += 100) {
    const batch = remaining.slice(offset, offset + 100);
    try {
      const accepted = new Set(batch);
      for (const entry of await transport(batch)) {
        if (typeof entry.goto !== "string" || !accepted.has(entry.goto)) continue;
        const resolved = destination(entry.url);
        if (resolved) mappings.set(entry.goto, resolved);
      }
    } catch (error) {
      if (error instanceof ProviderUsagePersistenceError) throw error;
      failed = true;
    }
  }
  return applyMappings(rows, urls, mappings, failed);
}
