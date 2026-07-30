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

function parts(record: Record<string, unknown>, labels: CountLabel[]) {
  return labels.flatMap((item) => {
    const value = count(record, item.key);
    return value > 0 ? [label(value, item)] : [];
  });
}

export function migrationImportCountSummary(counts: unknown) {
  const record = countRecord(counts);
  return {
    imported: parts(record, importedLabels),
    keywordsCreated: count(record, "keywords_created"),
    keywordsReceived: count(record, "keywords"),
    reportsKeywordCreations: Object.hasOwn(record, "keywords_created"),
    skipped: parts(record, skippedLabels),
  };
}
