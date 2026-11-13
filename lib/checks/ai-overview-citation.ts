import { normalizeDomain } from "@/lib/domains/normalize";
import { aiOverviewPresentation } from "./ai-overview-presentation";

type Item = { title?: string | null; rawFragment?: unknown };

export type AiOverviewCitation = {
  shown: boolean;
  cited: boolean;
  /** 1-based index among the overview sources the presentation keeps. */
  citedPosition: number | null;
  citedUrl: string | null;
  sourceCount: number;
  /** False when a stored overview block has no sources list at all. */
  complete: boolean;
};

const empty: AiOverviewCitation = {
  shown: false,
  cited: false,
  citedPosition: null,
  citedUrl: null,
  sourceCount: 0,
  complete: true,
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A sources list is present even when every URL is later dropped as unsafe. */
function hasSourcesList(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  const row = record(value);
  if (!row) return false;
  if (Array.isArray(row.references) || Array.isArray(row.sources)) return true;
  for (const key of ["items", "text_blocks"]) {
    const children = row[key];
    if (Array.isArray(children) && children.some((child) => hasSourcesList(child, depth + 1)))
      return true;
  }
  return false;
}

/** Project host, with one leading www ignored. A subdomain is a different site. */
function sameSite(url: string, domain: string | null) {
  if (!domain) return false;
  const host = normalizeDomain(url);
  const site = normalizeDomain(domain);
  return Boolean(host && site && host === site);
}

export function aiOverviewCitation(
  items: readonly Item[],
  projectDomain: string | null,
): AiOverviewCitation {
  if (!items.length) return empty;
  const sources = aiOverviewPresentation(items).sources;
  const index = sources.findIndex((source) => sameSite(source.url, projectDomain));
  const match = index >= 0 ? sources[index] : undefined;
  return {
    shown: true,
    cited: Boolean(match),
    citedPosition: match ? index + 1 : null,
    citedUrl: match ? match.url : null,
    sourceCount: sources.length,
    complete: items.some((item) => hasSourcesList(item.rawFragment)),
  };
}
