export const TAG_PATTERN_MAX_LENGTH = 500;
export const TAG_PATTERN_MAX_WILDCARDS = 16;
export const TAG_RULE_URL_MAX = 2_000;
export const TAG_RULE_EXCLUDE_MAX = 50;
const PATH_MATCH_LIMIT = 4_096;

export const tagPageRuleKinds = ["path_pattern", "sitemap", "url_list", "manual"] as const;
export type TagPageRuleKind = (typeof tagPageRuleKinds)[number];

export const tagPatternCodes = [
  "required",
  "must_start_with_slash",
  "too_long",
  "too_many_wildcards",
] as const;
export type TagPatternCode = (typeof tagPatternCodes)[number];

type Token = { kind: "lit"; text: string } | { kind: "slug" } | { kind: "star" };

export type TagRulePage = {
  id: string;
  path: string;
  sitemapUrls?: readonly string[];
};

export type TagRuleShape = {
  excludePatterns?: readonly string[];
  kind: TagPageRuleKind;
  pattern?: string | null;
  sitemapUrl?: string | null;
  urls?: readonly string[];
};

/** Drops a trailing slash the way a canonical page path does, except on `/`. */
export function stripTagPatternSlash(value: string) {
  const queryAt = value.indexOf("?");
  const pathname = queryAt === -1 ? value : value.slice(0, queryAt);
  const query = queryAt === -1 ? "" : value.slice(queryAt);
  let end = pathname.length;
  while (end > 1 && pathname[end - 1] === "/") end -= 1;
  return `${pathname.slice(0, end)}${query}`;
}

export function splitTagRuleLines(value: string) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Consecutive stars are one wildcard: `**` matches the same paths as `*`. */
export function collapseTagPatternStars(pattern: string) {
  return pattern.replace(/\*+/gu, "*");
}

function wildcardCount(pattern: string) {
  const collapsed = collapseTagPatternStars(pattern);
  let count = 0;
  for (let index = 0; index < collapsed.length; index += 1) {
    if (collapsed.startsWith("{slug}", index)) {
      count += 1;
      index += "{slug}".length - 1;
      continue;
    }
    if (collapsed[index] === "*") count += 1;
  }
  return count;
}

export function tagPatternCode(input: string): TagPatternCode | null {
  const trimmed = input.trim();
  if (!trimmed) return "required";
  if (trimmed.length > TAG_PATTERN_MAX_LENGTH) return "too_long";
  if (!trimmed.startsWith("/")) return "must_start_with_slash";
  if (wildcardCount(trimmed) > TAG_PATTERN_MAX_WILDCARDS) return "too_many_wildcards";
  return null;
}

function tokenize(pattern: string): Token[] {
  const tokens: Token[] = [];
  let literal = "";
  const flush = () => {
    if (!literal) return;
    tokens.push({ kind: "lit", text: literal });
    literal = "";
  };
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern.startsWith("{slug}", index)) {
      flush();
      tokens.push({ kind: "slug" });
      index += "{slug}".length - 1;
      continue;
    }
    if (pattern[index] === "*") {
      flush();
      if (tokens.at(-1)?.kind !== "star") tokens.push({ kind: "star" });
      continue;
    }
    literal += pattern[index];
  }
  flush();
  return tokens;
}

/**
 * Linear matcher. Literals are compared as text, so a pattern cannot inject a
 * regular expression. `{slug}` consumes one non-empty segment. `*` consumes
 * any span, including slashes, and the search records each state once.
 */
export function tokensMatch(tokens: readonly Token[], path: string) {
  if (path.length > PATH_MATCH_LIMIT) return false;
  const cols = path.length + 1;
  const seen = new Uint8Array((tokens.length + 1) * cols);
  const queue: number[] = [0];
  seen[0] = 1;
  let head = 0;
  while (head < queue.length) {
    const state = queue[head] ?? 0;
    head += 1;
    const tokenIndex = Math.floor(state / cols);
    const pathIndex = state % cols;
    if (tokenIndex === tokens.length) continue;
    const token = tokens[tokenIndex];
    if (!token) continue;
    if (token.kind === "star") {
      visit(tokenIndex + 1, pathIndex);
      if (pathIndex < path.length) visit(tokenIndex, pathIndex + 1);
      continue;
    }
    if (token.kind === "slug") {
      if (pathIndex >= path.length || path[pathIndex] === "/") continue;
      let end = pathIndex + 1;
      while (end < path.length && path[end] !== "/") end += 1;
      visit(tokenIndex + 1, end);
      continue;
    }
    if (path.startsWith(token.text, pathIndex)) {
      visit(tokenIndex + 1, pathIndex + token.text.length);
    }
  }
  return seen[tokens.length * cols + path.length] === 1;

  function visit(tokenIndex: number, pathIndex: number) {
    const key = tokenIndex * cols + pathIndex;
    if (seen[key]) return;
    seen[key] = 1;
    queue.push(key);
  }
}

export function compileTagPattern(input: string) {
  const code = tagPatternCode(input);
  if (code) return { code, ok: false as const };
  const pattern = collapseTagPatternStars(stripTagPatternSlash(input.trim()));
  const tokens = tokenize(pattern);
  return {
    matches(path: string) {
      return tokensMatch(tokens, stripTagPatternSlash(path));
    },
    ok: true as const,
    pattern,
  };
}

export function matchPagesForRule(rule: TagRuleShape, pages: readonly TagRulePage[]) {
  const excludes = (rule.excludePatterns ?? []).map((pattern) => {
    const compiled = compileTagPattern(pattern);
    if (!compiled.ok) throw new TagPatternError(compiled.code);
    return compiled.matches;
  });
  const excluded = (path: string) => excludes.some((matches) => matches(path));
  let matched: TagRulePage[] = [];
  if (rule.kind === "manual") matched = [];
  else if (rule.kind === "path_pattern") {
    const compiled = compileTagPattern(rule.pattern ?? "");
    if (!compiled.ok) throw new TagPatternError(compiled.code);
    matched = pages.filter((page) => compiled.matches(page.path) && !excluded(page.path));
  } else if (rule.kind === "sitemap") {
    const url = rule.sitemapUrl?.trim();
    matched = url
      ? pages.filter((page) => page.sitemapUrls?.includes(url) && !excluded(page.path))
      : [];
  } else {
    const urls = new Set(rule.urls ?? []);
    matched = pages.filter((page) => urls.has(page.path) && !excluded(page.path));
  }
  return matched
    .slice()
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export class TagPatternError extends Error {
  readonly code: TagPatternCode;

  constructor(code: TagPatternCode) {
    super(code);
    this.name = "TagPatternError";
    this.code = code;
  }
}
