import { createHash } from "node:crypto";
import { MODEL_PLAYGROUND_LIMITS, utf8Bytes } from "@/lib/model-playground/schema";
import type { ModelColumnResult } from "@/lib/model-playground/types";
import type { NativeText } from "./native-schema";

export function canonicalUrl(value: string) {
  if (/\s|\p{Cc}/u.test(value)) throw new Error();
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 2048
  )
    throw new Error();
  return url.href;
}

export function sourceReference(value: string) {
  const url = canonicalUrl(value);
  return { sourceId: `url:${createHash("sha256").update(url).digest("hex")}`, url };
}

function retainedTitle(value: string) {
  if (/[\uD800-\uDFFF\0]/u.test(value)) return null;
  return value.slice(0, 512).replace(/[\uD800-\uDBFF]$/, "");
}

function retainedPrefix(value: string) {
  let bytes = 0;
  let end = 0;
  for (const character of value) {
    bytes += utf8Bytes(character);
    if (bytes > MODEL_PLAYGROUND_LIMITS.answerBytes) break;
    end += character.length;
  }
  return value.slice(0, end);
}

function positionedAnnotations(blocks: NativeText[]) {
  let offset = 0;
  let occurrence = 0;
  return blocks.flatMap((block) => {
    const prefix = offset;
    offset += block.text.length + 1;
    return block.annotations.map((item) => ({
      block,
      item,
      offset: prefix,
      occurrence: ++occurrence,
    }));
  });
}

function normalizeOccurrence(position: ReturnType<typeof positionedAnnotations>[number]) {
  const { block, item, offset, occurrence } = position;
  // The reference does not define supplementary-character indexing units.
  const ambiguous = /[\u{10000}-\u{10ffff}]/u.test(block.text);
  if (item.start_index >= item.end_index || item.end_index > block.text.length) throw new Error();
  const citation = {
    occurrenceId: `citation:${occurrence}`,
    ...sourceReference(item.url),
    title: retainedTitle(item.title),
    start: ambiguous ? null : offset + item.start_index,
    end: ambiguous ? null : offset + item.end_index,
  };
  return { citation, ambiguous };
}

function outsideRetainedAnswer(
  position: ReturnType<typeof positionedAnnotations>[number],
  length: number,
  ambiguous: boolean,
) {
  return (
    position.offset + position.block.text.length > length &&
    (ambiguous || position.offset + position.item.end_index > length)
  );
}

/** Keep block order and separate blocks with one newline; offsets belong to retained text. */
export function normalizeText(blocks: NativeText[]) {
  const full = blocks.map((block) => block.text).join("\n");
  const answer = blocks.length ? retainedPrefix(full) : null;
  const citations: ModelColumnResult["citations"] = [];
  const sources = new Map<string, string>();
  let omitted = false;
  const positions = positionedAnnotations(blocks);
  for (const position of positions) {
    const { citation, ambiguous } = normalizeOccurrence(position);
    const previous = sources.get(citation.sourceId);
    if (previous !== undefined && previous !== citation.url) throw new Error();
    sources.set(citation.sourceId, citation.url);
    if (
      answer === null ||
      outsideRetainedAnswer(position, answer.length, ambiguous) ||
      citations.length >= MODEL_PLAYGROUND_LIMITS.citations
    ) {
      omitted = true;
      continue;
    }
    if (citation.title !== position.item.title) omitted = true;
    citations.push(citation);
  }
  return {
    answer,
    citations,
    application: answer !== null && answer.length < full.length,
    omitted,
    totals: { total: positions.length, omitted: positions.length - citations.length },
  };
}
