import { createHash } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { normalizeLandingPath } from "@/lib/search-insights/join";

/**
 * Canonical path of one project URL.
 *
 * Host: compared case-insensitively, with one leading `www.` ignored on the
 * project domain and on the URL. Only `http` and `https` (and protocol-relative
 * URLs) can belong to the site. Any other scheme is rejected. Userinfo is
 * rejected. The port is ignored, matching `URL.hostname`.
 *
 * Path: `normalizeLandingPath` from `lib/search-insights/join.ts`, the same
 * landing key Search Console uses to join analytics paths:
 * - path case is preserved
 * - a trailing slash is removed, except for the root `/`
 * - the query string is kept, including `?`, unsorted and case-preserved
 * - the fragment is dropped
 * - `.` and `..` segments are resolved
 * - spaces and non-ASCII characters are percent-encoded the way the URL parser does
 *
 * A value with no scheme is a path on this project, not a host. An empty value
 * is not a page (`null`), unlike `normalizeLandingPath("") === "/"`.
 *
 * `pagePathSqlRules` is the independent string form of the same decisions.
 * `canonicalPagePathSql` is that form in SQL for joins: it uses the same
 * authority pattern, www strip, query keep, fragment drop and trailing-slash
 * trim. It does not re-encode an already encoded path.
 */

const HTTP_URL = /^https?:\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/i;
const PROTOCOL_RELATIVE = /^\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/;
const ANY_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const WWW_PREFIX = /^www\./;

export const PAGE_PATH_HTTP_PATTERN = "^https?://([^/?#]*)([^?#]*)(?:\\?([^#]*))?";
export const PAGE_PATH_WWW_PATTERN = "^www\\.";

export function canonicalProjectHost(domain: string): string | null {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutScheme = trimmed.replace(/^[a-z][a-z\d+.-]*:\/\//, "");
  const authority = withoutScheme.split("/")[0]?.split("@").pop() ?? "";
  const host = authority.split(":")[0] ?? "";
  if (!host || host.includes(" ") || !host.includes(".")) return null;
  return host.replace(WWW_PREFIX, "");
}

function stripWww(host: string) {
  return host.toLowerCase().replace(WWW_PREFIX, "");
}

function parseHttpUrl(value: string) {
  try {
    return new URL(value.startsWith("//") ? `https:${value}` : value);
  } catch {
    return null;
  }
}

/** Normalized project path, or null when the URL is not on this site. */
export function pagePathForProject(domain: string, rawUrlOrPath: string): string | null {
  const projectHost = canonicalProjectHost(domain);
  if (!projectHost) return null;
  const value = rawUrlOrPath.trim();
  if (!value) return null;
  if (value.startsWith("//") || /^https?:\/\//i.test(value)) {
    const url = parseHttpUrl(value);
    if (!url || url.username || url.password) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (stripWww(url.hostname) !== projectHost) return null;
    return normalizeLandingPath(value);
  }
  if (ANY_SCHEME.test(value)) return null;
  return normalizeLandingPath(value);
}

function encodePathPiece(value: string) {
  return value.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@%/]/gu, (char) =>
    [...Buffer.from(char)].map((byte) => `%${byte.toString(16).toUpperCase()}`).join(""),
  );
}

function resolveDotSegments(pathname: string) {
  const out: string[] = [];
  for (const part of pathname.split("/")) {
    if (part === "" || part === ".") {
      if (out.length === 0) out.push("");
      continue;
    }
    if (part === "..") {
      if (out.length > 1) out.pop();
      continue;
    }
    out.push(part);
  }
  const path = out.join("/");
  return path.startsWith("/") ? path || "/" : `/${path}`;
}

function finishPath(pathname: string, query: string) {
  const resolved = resolveDotSegments(pathname.startsWith("/") ? pathname : `/${pathname}`);
  const trimmed =
    resolved !== "/" && resolved.endsWith("/") ? resolved.replace(/\/+$/u, "") || "/" : resolved;
  const encoded = encodePathPiece(trimmed);
  const encodedQuery = encodePathPiece(query);
  return encodedQuery ? `${encoded}?${encodedQuery}` : encoded;
}

function splitRelative(value: string) {
  const withoutHash = value.split("#")[0] ?? "";
  const queryAt = withoutHash.indexOf("?");
  const pathname = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const query = queryAt === -1 ? "" : withoutHash.slice(queryAt + 1);
  return finishPath(pathname || "/", query);
}

function fromAuthority(projectHost: string, authority: string, pathname: string, query: string) {
  if (authority.includes("@")) return null;
  const host = stripWww(authority.split(":")[0] ?? "");
  if (host !== projectHost) return null;
  return finishPath(pathname || "/", query);
}

/**
 * String implementation of the page-path rule, without the URL parser.
 * Documented cases must match `pagePathForProject` exactly.
 */
export function pagePathSqlRules(domain: string, rawUrlOrPath: string): string | null {
  const projectHost = canonicalProjectHost(domain);
  if (!projectHost) return null;
  const value = rawUrlOrPath.trim();
  if (!value) return null;
  if (ANY_SCHEME.test(value) && !HTTP_URL.test(value)) return null;
  const absolute = HTTP_URL.exec(value);
  if (absolute) {
    return fromAuthority(projectHost, absolute[1] ?? "", absolute[2] ?? "", absolute[3] ?? "");
  }
  const relative = PROTOCOL_RELATIVE.exec(value);
  if (relative) {
    return fromAuthority(projectHost, relative[1] ?? "", relative[2] ?? "", relative[3] ?? "");
  }
  return splitRelative(value);
}

/** sha256 hex of the path. One part, so this matches `dimensionKeyHash([path])`. */
export function pagePathHash(path: string) {
  return createHash("sha256").update(path).digest("hex");
}

export function projectPageUrl(domain: string, path: string) {
  const host = domain
    .trim()
    .replace(/^[a-z][a-z\d+.-]*:\/\//i, "")
    .split("/")[0];
  return `https://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

function trimmedPath(path: Prisma.Sql) {
  return Prisma.sql`CASE
    WHEN ${path} IS NULL OR ${path} = '' OR ${path} = '/' THEN '/'
    ELSE regexp_replace(${path}, '/+$', '')
  END`;
}

/**
 * SQL form of the host gate and landing path. `host` is `canonicalProjectHost`.
 * Already encoded octets are left in place; the TypeScript rule encodes raw
 * spaces and non-ASCII before anything is stored. Dot segments are resolved
 * in TypeScript before a path is stored.
 */
export function canonicalPagePathSql(raw: Prisma.Sql, host: string): Prisma.Sql {
  const source = Prisma.sql`CASE
    WHEN btrim(${raw}) LIKE '//%' THEN 'https:' || btrim(${raw})
    ELSE btrim(${raw})
  END`;
  const match = Prisma.sql`regexp_match(${source}, ${PAGE_PATH_HTTP_PATTERN}, 'i')`;
  const authority = Prisma.sql`(${match})[1]`;
  const pathname = Prisma.sql`COALESCE(NULLIF((${match})[2], ''), '/')`;
  const query = Prisma.sql`COALESCE((${match})[3], '')`;
  const hostOk = Prisma.sql`regexp_replace(lower(split_part(${authority}, ':', 1)), ${PAGE_PATH_WWW_PATTERN}, '') = ${host}`;
  const relativePath = Prisma.sql`'/' || regexp_replace(split_part(split_part(${source}, '#', 1), '?', 1), '^/', '')`;
  const relativeQuery = Prisma.sql`CASE
    WHEN position('?' in split_part(${source}, '#', 1)) = 0 THEN ''
    ELSE split_part(split_part(${source}, '#', 1), '?', 2)
  END`;
  return Prisma.sql`(
    CASE
      WHEN ${source} = '' OR ${host} = '' THEN NULL
      WHEN ${source} ~* '^[a-z][a-z0-9+.-]*:' AND ${source} !~* '^https?://' THEN NULL
      WHEN ${source} ~* '^https?://' THEN
        CASE
          WHEN ${authority} LIKE '%@%' OR NOT (${hostOk}) THEN NULL
          ELSE (${trimmedPath(pathname)}) || CASE WHEN ${query} = '' THEN '' ELSE '?' || ${query} END
        END
      ELSE (${trimmedPath(relativePath)}) || CASE WHEN ${relativeQuery} = '' THEN '' ELSE '?' || ${relativeQuery} END
    END
  )`;
}
