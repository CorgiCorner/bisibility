export const MAX_SITEMAP_ENTRIES = 5000;
export const MAX_CHILD_SITEMAPS = 5;

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

const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

function decodeEntity(entity: string) {
  const normalized = entity.toLowerCase();
  if (normalized.startsWith("#x")) {
    const codePoint = Number.parseInt(normalized.slice(2), 16);
    try {
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
    } catch {
      return `&${entity};`;
    }
  }
  if (normalized.startsWith("#")) {
    const codePoint = Number.parseInt(normalized.slice(1), 10);
    try {
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
    } catch {
      return `&${entity};`;
    }
  }
  return namedEntities[normalized] ?? `&${entity};`;
}

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (_, entity: string) =>
      decodeEntity(entity),
    )
    .trim();
}

function firstTagText(xml: string, tag: "lastmod" | "loc") {
  const pattern = new RegExp(String.raw`<${tag}\b[^>]*>([\s\S]*?)<\/${tag}>`, "i"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp - tag is a closed literal union.
  const match = pattern.exec(xml);
  if (!match?.[1]) return null;
  const decoded = decodeXmlText(match[1]);
  return decoded.length > 0 ? decoded : null;
}

function hasRoot(xml: string, root: "sitemapindex" | "urlset") {
  return new RegExp(String.raw`<${root}\b`, "i").test(xml); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp - root is a closed literal union.
}

function entryFromBlock(block: string): SitemapEntry | null {
  const loc = firstTagText(block, "loc");
  if (!loc) return null;

  const lastmod = firstTagText(block, "lastmod");
  return lastmod ? { lastmod, loc } : { loc };
}

function parseBlocks(xml: string, tag: "sitemap" | "url", maxEntries: number) {
  const pattern = new RegExp(String.raw`<${tag}\b[^>]*>([\s\S]*?)<\/${tag}>`, "gi"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp - tag is a closed literal union.
  const entries: SitemapEntry[] = [];
  let total = 0;

  for (const match of xml.matchAll(pattern)) {
    const block = match[1];
    if (!block) continue;

    const entry = entryFromBlock(block);
    if (!entry) continue;

    total += 1;
    if (entries.length < maxEntries) {
      entries.push(entry);
    }
  }

  return { entries, total, truncated: total > entries.length };
}

function parseUrlset(xml: string, maxEntries: number): ParsedSitemap {
  const parsed = parseBlocks(xml, "url", maxEntries);
  return {
    childSitemapCount: 0,
    childSitemaps: [],
    childSitemapUrls: [],
    entries: parsed.entries,
    kind: "urlset",
    truncated: parsed.truncated,
    urlCount: parsed.total,
  };
}

function parseSitemapIndex(xml: string, maxChildSitemaps: number): ParsedSitemap {
  const parsed = parseBlocks(xml, "sitemap", maxChildSitemaps);
  return {
    childSitemapCount: parsed.total,
    childSitemaps: parsed.entries,
    childSitemapUrls: parsed.entries.map((entry) => entry.loc),
    entries: [],
    kind: "sitemapindex",
    truncated: parsed.truncated,
    urlCount: 0,
  };
}

export function parseSitemapXml(xml: string, options: ParseOptions = {}): ParsedSitemap {
  const maxEntries = Math.max(0, options.maxEntries ?? MAX_SITEMAP_ENTRIES);
  const maxChildSitemaps = Math.max(0, options.maxChildSitemaps ?? MAX_CHILD_SITEMAPS);

  if (hasRoot(xml, "sitemapindex")) {
    return parseSitemapIndex(xml, maxChildSitemaps);
  }
  if (hasRoot(xml, "urlset")) {
    return parseUrlset(xml, maxEntries);
  }

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
