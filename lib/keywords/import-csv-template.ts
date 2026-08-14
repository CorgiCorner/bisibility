export const keywordImportTemplateColumns = [
  "keyword",
  "target_url",
  "tags",
  "country",
  "language",
  "device",
] as const;

export const keywordImportTemplateCsv = `${keywordImportTemplateColumns.join(",")}
edge function logs,/docs/logs,docs;infra,US,en,desktop
vector database,/products/vector,product,US,en,mobile
llms.txt,/blog/llms-txt,content,GB,en,desktop`;
