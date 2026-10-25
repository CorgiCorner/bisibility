import type { AiResearchRow } from "./types";

const ROW_MAX_BYTES = 10_000;
function bytes(row: AiResearchRow) {
  return new TextEncoder().encode(JSON.stringify(row)).byteLength;
}
export function boundAiRow(
  row: AiResearchRow,
  maxBytes = ROW_MAX_BYTES,
  preservePrompt = false,
): AiResearchRow {
  const bounded = {
    ...row,
    citations: [...row.citations],
    contentTruncated: row.contentTruncated ?? false,
  };
  while (bytes(bounded) > maxBytes) {
    bounded.contentTruncated = true;
    if (bounded.answer.length > 100)
      bounded.answer = bounded.answer.slice(0, Math.floor(bounded.answer.length / 2));
    else if (bounded.citations.length > 1) bounded.citations.pop();
    else if (preservePrompt && bounded.citations.length) bounded.citations.pop();
    else if (preservePrompt && bounded.answer.length) bounded.answer = "";
    else if (!preservePrompt && bounded.prompt.length > 100)
      bounded.prompt = bounded.prompt.slice(0, 100);
    else throw new Error("Provider row exceeds the report byte budget.");
  }
  return bounded;
}
