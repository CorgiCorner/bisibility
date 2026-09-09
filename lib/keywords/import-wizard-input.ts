import type { KeywordImportColumnMapping, KeywordImportField } from "./import-csv-parser";

export function keywordImportWizardInput({
  file,
  ...values
}: {
  columnMapping: KeywordImportColumnMapping;
  csv: string;
  defaultMarketKey: string | null;
  file: File | null;
  projectId?: string;
  refresh: "deferred";
}) {
  if (!file) return values;
  const data = new FormData();
  data.set("file", file);
  if (values.projectId) data.set("projectId", values.projectId);
  if (values.defaultMarketKey) data.set("defaultMarketKey", values.defaultMarketKey);
  data.set("refresh", values.refresh);
  if (Object.keys(values.columnMapping).length)
    data.set("columnMapping", JSON.stringify(values.columnMapping));
  return data;
}

export function updateKeywordImportMapping(
  current: KeywordImportColumnMapping,
  sourceIndex: number,
  destination: KeywordImportField | null,
): KeywordImportColumnMapping {
  const next = Object.fromEntries(
    Object.entries(current).filter(
      ([field, index]) => index !== sourceIndex && field !== destination,
    ),
  ) as KeywordImportColumnMapping;
  return destination ? { ...next, [destination]: sourceIndex } : next;
}
