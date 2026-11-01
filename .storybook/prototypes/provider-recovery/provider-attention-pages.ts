import { affectedKeywords } from "./provider-attention-copy";

export const attentionPageSize = 50;
export const formatCheckCount = (count: number) => count.toLocaleString("en-US");
export const checksLabel = (count: number) =>
  `${formatCheckCount(count)} ${count === 1 ? "check" : "checks"}`;

export type AttentionCheckRow = { id: string; keyword: string };
export type AttentionCheckPage = {
  rows: AttentionCheckRow[];
  nextCursor: string | null;
};

/** Local cursor-page fixture; it never creates the full collection or calls a provider. */
export function attentionCheckPage(total: number, cursor: string | null): AttentionCheckPage {
  const start = cursor === null ? 0 : Number(cursor.slice("check:".length));
  const end = Math.min(start + attentionPageSize, total);
  return {
    rows: Array.from({ length: Math.max(0, end - start) }, (_, offset) => {
      const index = start + offset;
      const keyword = affectedKeywords[index % affectedKeywords.length] ?? "keyword";
      return {
        id: `check-${index + 1}`,
        keyword: total <= affectedKeywords.length ? keyword : `${keyword} ${index + 1}`,
      };
    }),
    nextCursor: end < total ? `check:${end}` : null,
  };
}
