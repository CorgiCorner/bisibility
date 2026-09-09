import { lookup as dnsLookup } from "node:dns/promises";
import type { ExpectedUrlCache, ExpectedUrlDocument, ExpectedUrlLogger } from "./types";

const BODY_LIMIT = 1_048_576;
const CACHE_WINDOW_MS = 300_000;
const MAX_REDIRECTS = 3;

type DnsAnswer = { address: string; family: number };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export type FetchExpectedUrlDocumentInput = {
  cache: ExpectedUrlCache;
  fetcher?: Fetcher;
  logger: ExpectedUrlLogger;
  lookup?: (hostname: string) => Promise<DnsAnswer[]>;
  projectId: string;
  timeoutMs?: number;
  url: string;
};

function globalAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value.includes(":")) {
    if (value === "::" || value === "::1" || value.startsWith("fe80:") || /^(fc|fd)/.test(value))
      return false;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? globalAddress(mapped) : true;
  }
  const octets = value.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  )
    return false;
  const [first, second] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  return true;
}

function documentContentType(response: Response) {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() ?? "";
  return ["text/html", "application/xhtml+xml", "application/xml", "text/xml"].includes(contentType)
    ? contentType
    : null;
}

async function responseBody(response: Response) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > BODY_LIMIT) throw new Error("body_too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > BODY_LIMIT) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(part.value);
  }
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function cacheKey(input: FetchExpectedUrlDocumentInput) {
  return `${input.projectId}:${input.url}`;
}

function logFailure(logger: ExpectedUrlLogger, reason: string, url: string, error?: unknown) {
  logger({
    error: error instanceof Error ? error.message : error ? String(error) : undefined,
    reason,
    url,
  });
}

export async function fetchExpectedUrlDocument(
  input: FetchExpectedUrlDocumentInput,
): Promise<ExpectedUrlDocument | null> {
  const key = cacheKey(input);
  const cached = input.cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const fetcher = input.fetcher ?? fetch;
  const lookup = input.lookup ?? ((hostname) => dnsLookup(hostname, { all: true }));
  const timeoutMs = input.timeoutMs ?? 5_000;
  let current: URL;
  try {
    current = new URL(input.url);
    if (current.protocol !== "https:") throw new Error("non_https_url");
  } catch (error) {
    logFailure(input.logger, "invalid_fetch_url", input.url, error);
    return null;
  }
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    try {
      const answers = await lookup(current.hostname);
      if (answers.length === 0 || answers.some((answer) => !globalAddress(answer.address))) {
        logFailure(input.logger, "unsafe_dns_address", current.toString());
        return null;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetcher(current.toString(), {
          redirect: "manual",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) {
          logFailure(input.logger, "redirect_limit", current.toString());
          return null;
        }
        current = new URL(location, current);
        if (current.protocol !== "https:") {
          logFailure(input.logger, "redirect_non_https", current.toString());
          return null;
        }
        continue;
      }
      const contentType = documentContentType(response);
      if (!response.ok || !contentType) {
        logFailure(
          input.logger,
          response.ok ? "unsupported_content_type" : "fetch_response_error",
          current.toString(),
        );
        return null;
      }
      const value = { body: await responseBody(response), contentType, url: current.toString() };
      input.cache.set(key, { expiresAt: Date.now() + CACHE_WINDOW_MS, value });
      return value;
    } catch (error) {
      logFailure(
        input.logger,
        error instanceof Error && error.message === "body_too_large"
          ? "body_too_large"
          : "fetch_failed",
        current.toString(),
        error,
      );
      return null;
    }
  }
  return null;
}
