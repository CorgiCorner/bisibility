import { MODEL_PLAYGROUND_LIMITS, utf8Bytes } from "@/lib/model-playground/schema";
import type { ModelColumnResult } from "@/lib/model-playground/types";
import { record } from "./usage";

export function retainAnswer(value: string) {
  if (utf8Bytes(value) <= MODEL_PLAYGROUND_LIMITS.answerBytes) return value;
  let bytes = 0;
  let retained = "";
  for (const character of value) {
    bytes += utf8Bytes(character);
    if (bytes > MODEL_PLAYGROUND_LIMITS.answerBytes) break;
    retained += character;
  }
  return retained;
}

export function normalizeCitations(annotations: unknown, apiKey: string) {
  const citations: ModelColumnResult["citations"] = [];
  const sources = new Map<string, string>();
  let truncated = false;
  let credentialEcho = false;
  if (annotations === undefined || annotations === null)
    return { citations, truncated, credentialEcho };
  if (!Array.isArray(annotations)) return { citations, truncated: true, credentialEcho };
  for (const item of annotations) {
    const annotation = record(item);
    const citation = record(annotation.url_citation);
    if (typeof citation.title === "string" && citation.title.includes(apiKey)) {
      truncated = true;
      credentialEcho = true;
      continue;
    }
    let url: URL;
    try {
      if (annotation.type !== "url_citation" || typeof citation.url !== "string") throw new Error();
      url = new URL(citation.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        citation.url.length > 2048 ||
        /\s|\p{Cc}/u.test(citation.url) ||
        citations.length >= MODEL_PLAYGROUND_LIMITS.citations
      )
        throw new Error();
    } catch {
      truncated = true;
      continue;
    }
    const sourceId = sources.get(citation.url as string) ?? `source_${sources.size}`;
    sources.set(citation.url as string, sourceId);
    let title: string | null = null;
    if (typeof citation.title === "string") {
      if (/[\uD800-\uDFFF]/u.test(citation.title)) truncated = true;
      else {
        title = Array.from(citation.title).slice(0, 256).join("");
        if (title !== citation.title) truncated = true;
      }
    }
    citations.push({
      occurrenceId: `citation_${citations.length}`,
      sourceId,
      url: citation.url as string,
      title,
      // The docs do not specify UTF-16 offsets. Never label ambiguous offsets as P01 ranges.
      start: null,
      end: null,
    });
  }
  return { citations, truncated, credentialEcho };
}
