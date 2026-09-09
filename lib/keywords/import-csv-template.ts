export const keywordImportTemplateColumns = [
  "keyword",
  "target_url",
  "tags",
  "country",
  "language",
  "device",
] as const;

export const keywordImportTemplateCsv = `${keywordImportTemplateColumns.join(",")}
edge function logs,/docs/logs,docs;infra,,,desktop
vector database,/products/vector,product,,,mobile
llms.txt,/blog/llms-txt,content,,,desktop`;

/** Multi-market examples only reference the project's existing canonical locations. */
export function keywordImportTemplateForMarkets(
  keys: readonly string[],
  defaultMarketKey: string | null,
) {
  if (defaultMarketKey || keys.length === 0) return keywordImportTemplateCsv;
  const lines = keywordImportTemplateCsv.split("\n");
  return [
    `${lines[0]},location_key`,
    ...lines
      .slice(1)
      .map((line, index) => `${line},"${keys[index % keys.length].replaceAll('"', '""')}"`),
  ].join("\n");
}
