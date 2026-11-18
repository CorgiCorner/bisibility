import { MODEL_PLAYGROUND_LIMITS, utf8Bytes } from "./schema";
import type { ModelColumnResult } from "./types";

export const MODEL_RESULT_BYTES = 256 * 1024;

function numberBytes(value: number): number {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  const text = JSON.stringify(value);
  if (!text.includes("e")) return text.length;
  const [mantissa, exponent] = text.split("e");
  const unsigned = mantissa.replace("-", "");
  const digits = unsigned.replace(".", "").length;
  const point = unsigned.split(".")[0].length + Number(exponent);
  const width =
    point <= 0 ? 2 - point + digits : Math.max(point, digits) + (point < digits ? 1 : 0);
  return width + Number(value < 0);
}

/** Exact jsonb::text UTF-8 length for normalized JSON: key order cannot affect size.
 * PostgreSQL adds one space after commas/colons and expands exponent-form numbers.
 * Values PostgreSQL cannot represent (NUL or lone surrogates) never pass the bound.
 */
export function jsonbTextBytes(value: unknown): number {
  if (value === null) return 4;
  if (typeof value === "number") return numberBytes(value);
  if (typeof value === "boolean") return value ? 4 : 5;
  if (typeof value === "string")
    return value.includes("\0") || /[\uD800-\uDFFF]/u.test(value)
      ? Number.POSITIVE_INFINITY
      : utf8Bytes(JSON.stringify(value));
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (
      typeof (value as { toJSON?: unknown }).toJSON === "function" ||
      (prototype !== Object.prototype &&
        prototype !== null &&
        !(Array.isArray(value) && prototype === Array.prototype))
    )
      return Number.POSITIVE_INFINITY;
  }
  if (Array.isArray(value))
    return (
      2 +
      Math.max(0, value.length - 1) * 2 +
      value.reduce((sum, item) => sum + jsonbTextBytes(item), 0)
    );
  if (typeof value !== "object") return Number.POSITIVE_INFINITY;
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  return (
    2 +
    Math.max(0, entries.length - 1) * 2 +
    entries.reduce((sum, [key, item]) => sum + jsonbTextBytes(key) + 2 + jsonbTextBytes(item), 0)
  );
}

export const fitsModelResult = (result: ModelColumnResult) =>
  jsonbTextBytes(result) <= MODEL_RESULT_BYTES;

/** Retain a prefix of consulted sources; answer/citations and measured costs stay intact. */
export function fitModelResultSources(result: ModelColumnResult): ModelColumnResult | null {
  if (fitsModelResult(result)) return result;
  const original = result.consultedSources;
  if (!original?.sources.length) return null;
  const candidate = (kept: number): ModelColumnResult => {
    const removed = original.sources.length - kept;
    const omitted =
      original.total !== null
        ? original.total - kept
        : original.omitted !== null && original.omitted <= Number.MAX_SAFE_INTEGER - removed
          ? original.omitted + removed
          : null;
    return {
      ...result,
      consultedSources: {
        ...original,
        sources: original.sources.slice(0, kept),
        omitted,
        truncated: true,
      },
    };
  };
  if (!fitsModelResult(candidate(0))) return null;
  let low = 0,
    high = original.sources.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fitsModelResult(candidate(mid))) low = mid;
    else high = mid - 1;
  }
  return candidate(low);
}

function partial(result: ModelColumnResult): ModelColumnResult {
  return { ...result, state: result.state === "completed" ? "partial" : result.state };
}

function trimCitations(result: ModelColumnResult, kept: number): ModelColumnResult {
  const removed = result.citations.length - kept;
  const totals = result.citationTotals;
  const total = totals
    ? totals.total
    : result.truncation.citations
      ? null
      : result.citations.length;
  const omitted =
    total !== null ? total - kept : totals?.omitted == null ? null : totals.omitted + removed;
  return {
    ...result,
    citations: result.citations.slice(0, kept),
    truncation: { ...result.truncation, citations: true },
    citationTotals: {
      total,
      omitted: omitted !== null && Number.isSafeInteger(omitted) ? omitted : null,
    },
  };
}

/** Keep answer text first, then source/citation prefixes; never invent a provider failure. */
export function fitModelResult(result: ModelColumnResult): ModelColumnResult {
  // metadata=true discloses dropped supplemental cost/receipt references and unknown routing.
  // Provider money, native usage and the answer survive this storage-only fallback.
  const metadata = { ...result, answer: null, citations: [], consultedSources: undefined };
  const retained = fitsModelResult(metadata)
    ? result
    : {
        ...result,
        costEvidence: undefined,
        routingAttemptCredentials: {
          version: 1 as const,
          completeness: "unknown" as const,
          attempts: [],
        },
        paymentReceipt: null,
        rawEvidenceId: null,
        truncation: { ...result.truncation, metadata: true as const },
      };
  let value = fitModelResultSources(retained) ?? retained;
  if (!fitsModelResult(value) && value.consultedSources) {
    const sources = value.consultedSources;
    const removed = sources.sources.length;
    const omitted = sources.total ?? (sources.omitted === null ? null : sources.omitted + removed);
    value = {
      ...value,
      consultedSources: {
        ...sources,
        sources: [],
        truncated: sources.truncated || removed > 0,
        omitted: omitted !== null && Number.isSafeInteger(omitted) ? omitted : null,
      },
    };
  }
  if (!fitsModelResult(value) && value.citations.length) {
    const without = trimCitations(value, 0);
    if (!fitsModelResult(without)) value = without;
    else {
      let low = 0,
        high = value.citations.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (fitsModelResult(trimCitations(value, mid))) low = mid;
        else high = mid - 1;
      }
      value = trimCitations(value, low);
    }
  }
  // The transport normally enforces the answer bound. Retention also guards recovered observations.
  if (
    value.answer !== null &&
    (!fitsModelResult(value) ||
      new TextEncoder().encode(value.answer).length > MODEL_PLAYGROUND_LIMITS.answerBytes)
  ) {
    const answer = value.answer;
    const prefix = (end: number) => answer.slice(0, end).replace(/[\uD800-\uDBFF]$/, "");
    const candidate = (end: number): ModelColumnResult => ({
      ...partial(value),
      answer: prefix(end),
      citations: value.citations.map((citation) =>
        citation.end !== null && citation.end > prefix(end).length
          ? { ...citation, start: null, end: null }
          : citation,
      ),
      truncation: { ...value.truncation, application: true },
    });
    let lo = 0,
      hi = answer.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2),
        trial = candidate(mid);
      if (
        new TextEncoder().encode(trial.answer ?? "").length <=
          MODEL_PLAYGROUND_LIMITS.answerBytes &&
        fitsModelResult(trial)
      )
        lo = mid;
      else hi = mid - 1;
    }
    value = candidate(lo);
  }
  if (!fitsModelResult(value)) throw new Error("Invalid bounded result metadata");
  return value;
}
