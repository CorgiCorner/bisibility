export function uniqueKeywordTexts(keywords: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const keyword of keywords) {
    const key = keyword.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(keyword);
    }
  }
  return unique;
}

export { keywordTupleKey } from "./keyword-batch";
