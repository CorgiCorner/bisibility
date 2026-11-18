import { createHash } from "node:crypto";
import { MODEL_PLAYGROUND_LIMITS } from "@/lib/model-playground/schema";
import type { ModelColumnResult, ModelConsultedSources } from "@/lib/model-playground/types";
import { text } from "./text";
import { record } from "./usage";

function sourceUrl(value: unknown, apiKey: string) {
  const raw = text(record(value)?.url);
  const url = new URL(raw);
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    /[\s\p{Cc}]/u.test(raw) ||
    url.href.length > 2048 ||
    raw.includes(apiKey)
  )
    throw new Error();
  return url.href;
}
const sourceId = (url: string) => `source-${createHash("sha256").update(url).digest("hex")}`;
function sourceTitle(value: unknown, apiKey: string) {
  const title = record(value)?.title;
  if (title == null) return null;
  const safe = text(title);
  if (safe.includes(apiKey)) throw new Error();
  return safe;
}

/** Totals describe returned evidence, not every page considered by the search engine. */
export function collectSources(apiKey: string) {
  const citations: ModelColumnResult["citations"] = [];
  const sources = new Map<string, ModelConsultedSources["sources"][number]>();
  const seenUrls = new Set<string>();
  let citationCount = 0;
  let truncatedCitations = false;
  let observedResults = false;
  let unknownSourceCount = false;

  function addCitation(value: unknown, retained: boolean) {
    citationCount++;
    try {
      if (!retained || citations.length >= MODEL_PLAYGROUND_LIMITS.citations) throw new Error();
      const url = sourceUrl(value, apiKey);
      const title = sourceTitle(value, apiKey);
      const bounded = title?.slice(0, 512).replace(/[\uD800-\uDFFF]$/u, "") ?? null;
      if (title !== bounded) truncatedCitations = true;
      citations.push({
        occurrenceId: `citation-${citationCount}`,
        sourceId: sourceId(url),
        url,
        title: bounded,
        start: null,
        end: null,
      });
    } catch {
      truncatedCitations = true;
    }
  }

  function addResults(values: unknown[]) {
    observedResults = true;
    for (const value of values) {
      if (record(value)?.type !== "web_search_result") throw new Error();
      let url: string;
      try {
        url = sourceUrl(value, apiKey);
      } catch {
        unknownSourceCount = true;
        continue;
      }
      seenUrls.add(url);
      if (sources.has(url) || sources.size >= MODEL_PLAYGROUND_LIMITS.consultedSources) continue;
      try {
        const title = sourceTitle(value, apiKey);
        // Dropping preserves the consulted-list contract: truncation means omitted entries.
        if (title !== null && title.length > 512) throw new Error();
        sources.set(url, { sourceId: sourceId(url), url, title });
      } catch {
        /* The known URL still contributes to the distinct returned-source total. */
      }
    }
  }

  function evidence() {
    const consultedSources: ModelConsultedSources | undefined = observedResults
      ? {
          sources: [...sources.values()],
          total: unknownSourceCount ? null : seenUrls.size,
          omitted: unknownSourceCount ? null : seenUrls.size - sources.size,
          truncated: unknownSourceCount || seenUrls.size > sources.size,
        }
      : undefined;
    return {
      citations,
      citationTotals: { total: citationCount, omitted: citationCount - citations.length },
      truncatedCitations,
      consultedSources,
    };
  }
  return { addCitation, addResults, evidence };
}
