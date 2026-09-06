import { visibilityUnknownDepthImportCopy } from "@/lib/visibility/definition";

type CountLabel = {
  key: string;
  plural: string;
  singular: string;
};

const importedLabels: CountLabel[] = [
  { key: "keywords_created", plural: "new keywords", singular: "new keyword" },
  { key: "history", plural: "history rows", singular: "history row" },
  { key: "alert_rules", plural: "alert rules", singular: "alert rule" },
  { key: "competitors", plural: "competitors", singular: "competitor" },
  { key: "saved_views", plural: "saved views", singular: "saved view" },
  {
    key: "notification_preferences",
    plural: "notification preferences",
    singular: "notification preference",
  },
];

const skippedLabels: CountLabel[] = [
  { key: "keywords_skipped", plural: "keywords", singular: "keyword" },
  { key: "history_skipped", plural: "history rows", singular: "history row" },
  { key: "alert_rules_skipped", plural: "alert rules", singular: "alert rule" },
  { key: "competitors_skipped", plural: "competitors", singular: "competitor" },
  { key: "saved_views_skipped", plural: "saved views", singular: "saved view" },
  {
    key: "notification_preferences_skipped",
    plural: "notification preferences",
    singular: "notification preference",
  },
];

function countRecord(counts: unknown) {
  return counts && typeof counts === "object" && !Array.isArray(counts)
    ? (counts as Record<string, unknown>)
    : {};
}

function count(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "number" ? record[key] : 0;
}

function label(value: number, labels: CountLabel) {
  return `${value} ${value === 1 ? labels.singular : labels.plural}`;
}

type CountEntryStyle = "label-value" | "value-label";

function countEntry(key: string, value: number, style: CountEntryStyle) {
  if (key === "history_unknown_depth") {
    return label(value, {
      key,
      plural: "received history rows with unknown depth",
      singular: "received history row with unknown depth",
    });
  }
  const text = key.replaceAll("_", " ");
  return style === "label-value" ? `${text}: ${value}` : `${value} ${text}`;
}

function parts(record: Record<string, unknown>, labels: CountLabel[]) {
  return labels.flatMap((item) => {
    const value = count(record, item.key);
    return value > 0 ? [label(value, item)] : [];
  });
}

export function migrationImportCountEntries(
  counts: unknown,
  style: CountEntryStyle = "label-value",
) {
  const record = countRecord(counts);
  return Object.entries(record)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .map(([key, value]) => countEntry(key, value, style));
}

export function migrationImportCountSummary(counts: unknown) {
  const record = countRecord(counts);
  const unknownDepth = count(record, "history_unknown_depth");
  return {
    imported: parts(record, importedLabels),
    keywordsCreated: count(record, "keywords_created"),
    keywordsReceived: count(record, "keywords"),
    reportsKeywordCreations: Object.hasOwn(record, "keywords_created"),
    skipped: parts(record, skippedLabels),
    visibilityNote: unknownDepth > 0 ? visibilityUnknownDepthImportCopy(unknownDepth) : null,
  };
}
