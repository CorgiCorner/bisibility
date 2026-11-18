import { createHash } from "node:crypto";
import { MODEL_PLAYGROUND_LIMITS } from "@/lib/model-playground/schema";
import type { ModelColumnResult } from "@/lib/model-playground/types";
import { record } from "./usage";

export function retainAnswer(text: string) {
  let bytes = 0;
  let answer = "";
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > MODEL_PLAYGROUND_LIMITS.answerBytes) break;
    answer += character;
    bytes += size;
  }
  return { answer, truncated: answer.length !== text.length };
}

/** Standard URL annotations only; this does not establish gateway search support. */
export function normalizeCitations(
  value: unknown,
  answer: string | null,
  forbidden: readonly string[],
) {
  const citations: ModelColumnResult["citations"] = [];
  if (value === undefined || value === null) return { citations, truncated: false };
  if (answer === null) return { citations, truncated: !Array.isArray(value) || value.length > 0 };
  if (!Array.isArray(value)) return { citations, truncated: true };
  const ascii = Array.from(answer).every((character) => character.charCodeAt(0) <= 127);
  let truncated = false;
  for (const item of value) {
    try {
      const annotation = record(item);
      if (annotation.type !== "url_citation") throw new Error();
      const source = record(annotation.url_citation);
      if (typeof source.url !== "string" || source.url.length > 2048) throw new Error();
      const url = new URL(source.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw new Error();
      const canonical = url.href;
      if (
        canonical.length > 2048 ||
        forbidden.some((secret) => secret && canonical.includes(secret))
      )
        throw new Error();
      if (citations.length >= MODEL_PLAYGROUND_LIMITS.citations) throw new Error();
      let title = typeof source.title === "string" ? source.title : null;
      if (
        title &&
        (forbidden.some((secret) => secret && title?.includes(secret)) ||
          /[\uD800-\uDFFF]/u.test(title))
      ) {
        title = null;
        truncated = true;
      }
      if (title && title.length > 512) {
        title = Array.from(title).slice(0, 256).join("");
        truncated = true;
      }
      const start = source.start_index;
      const end = source.end_index;
      const hasRange = start !== undefined || end !== undefined;
      // Gateway Unicode offset units are unverified; ASCII ranges are unambiguous.
      const validRange =
        ascii &&
        typeof start === "number" &&
        Number.isSafeInteger(start) &&
        start >= 0 &&
        typeof end === "number" &&
        Number.isSafeInteger(end) &&
        start < end &&
        end <= answer.length;
      if (hasRange && !validRange) truncated = true;
      citations.push({
        occurrenceId: `citation-${citations.length + 1}`,
        sourceId: `source-${createHash("sha256").update(canonical).digest("hex")}`,
        url: canonical,
        title,
        start: validRange ? start : null,
        end: validRange ? end : null,
      });
    } catch {
      truncated = true;
    }
  }
  return { citations, truncated };
}
