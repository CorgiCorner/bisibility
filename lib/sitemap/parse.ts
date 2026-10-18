import { SaxesParser } from "saxes";

export const MAX_SITEMAP_ENTRIES = 5000;
export const MAX_CHILD_SITEMAPS = 5;
const MAX_XML_DEPTH = 32;
const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

export type SitemapEntry = {
  lastmod?: string;
  loc: string;
};

export type ParsedSitemap = {
  childSitemapCount: number;
  childSitemaps: SitemapEntry[];
  childSitemapUrls: string[];
  entries: SitemapEntry[];
  kind: "sitemapindex" | "unknown" | "urlset";
  truncated: boolean;
  urlCount: number;
};

type ParseOptions = {
  maxChildSitemaps?: number;
  maxEntries?: number;
};

type Field = keyof SitemapEntry;
type PendingEntry = { seen: Set<Field>; value: Partial<SitemapEntry> };
type Capture = { field: Field; nested: boolean; parts: string[] };

function unknownSitemap(): ParsedSitemap {
  return {
    childSitemapCount: 0,
    childSitemaps: [],
    childSitemapUrls: [],
    entries: [],
    kind: "unknown",
    truncated: false,
    urlCount: 0,
  };
}

export function parseSitemapXml(xml: string, options: ParseOptions = {}): ParsedSitemap {
  const maxEntries = Math.max(0, options.maxEntries ?? MAX_SITEMAP_ENTRIES);
  const maxChildSitemaps = Math.max(0, options.maxChildSitemaps ?? MAX_CHILD_SITEMAPS);
  const parser = new SaxesParser({ xmlns: true });
  const entries: SitemapEntry[] = [];
  const root: { kind: ParsedSitemap["kind"]; namespace: string } = {
    kind: "unknown",
    namespace: "",
  };
  let depth = 0;
  let total = 0;
  let entry: PendingEntry | null = null;
  let capture: Capture | null = null;

  parser.on("doctype", () => {
    throw new Error("Sitemap document types are not supported.");
  });
  parser.on("opentag", (tag) => {
    depth += 1;
    if (depth > MAX_XML_DEPTH) throw new Error("Sitemap XML nesting limit exceeded.");
    if (depth === 1) {
      if (
        (tag.uri === "" || tag.uri === SITEMAP_NAMESPACE) &&
        (tag.local === "urlset" || tag.local === "sitemapindex")
      ) {
        root.kind = tag.local;
      }
      root.namespace = tag.uri;
      return;
    }
    if (capture) {
      capture.nested = true;
      return;
    }
    if (root.kind === "unknown" || tag.uri !== root.namespace) return;
    if (depth === 2 && tag.local === (root.kind === "urlset" ? "url" : "sitemap")) {
      entry = { seen: new Set(), value: {} };
      return;
    }
    if (depth !== 3 || !entry || (tag.local !== "loc" && tag.local !== "lastmod")) return;
    if (entry.seen.has(tag.local)) return;
    entry.seen.add(tag.local);
    capture = { field: tag.local, nested: false, parts: [] };
  });
  const collectText = (text: string) => {
    if (capture && !capture.nested) capture.parts.push(text);
  };
  parser.on("text", collectText);
  parser.on("cdata", collectText);
  parser.on("closetag", () => {
    if (depth === 3 && capture) {
      const value = capture.parts.join("").trim();
      if (entry && !capture.nested && value) entry.value[capture.field] = value;
      capture = null;
    }
    if (depth === 2 && entry) {
      if (entry.value.loc) {
        total += 1;
        const limit = root.kind === "sitemapindex" ? maxChildSitemaps : maxEntries;
        if (entries.length < limit) {
          entries.push({
            loc: entry.value.loc,
            ...(entry.value.lastmod ? { lastmod: entry.value.lastmod } : {}),
          });
        }
      }
      entry = null;
    }
    depth -= 1;
  });

  try {
    parser.write(xml).close();
  } catch {
    // A malformed document must not publish entries collected before its error.
    return unknownSitemap();
  }
  if (root.kind === "unknown") return unknownSitemap();
  if (root.kind === "sitemapindex") {
    return {
      childSitemapCount: total,
      childSitemaps: entries,
      childSitemapUrls: entries.map((entry) => entry.loc),
      entries: [],
      kind: root.kind,
      truncated: total > entries.length,
      urlCount: 0,
    };
  }
  return {
    childSitemapCount: 0,
    childSitemaps: [],
    childSitemapUrls: [],
    entries,
    kind: root.kind,
    truncated: total > entries.length,
    urlCount: total,
  };
}
