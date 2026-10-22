export type AuditDiff = {
  after: string | number | boolean | null;
  before: string | number | boolean | null;
  field: string;
};

const ARRAY_LABEL_KEYS = ["text", "name", "publicId"] as const;

function readableArrayItem(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ARRAY_LABEL_KEYS) {
      const label = record[key];
      if (typeof label === "string" && label.trim()) return label;
    }
    return Object.entries(flattenSnapshot(value))
      .map(([field, item]) => `${field}: ${item ?? ""}`)
      .join("; ");
  }
  if (Array.isArray(value)) return value.map(readableArrayItem).join("; ");
  return value === null || value === undefined ? "" : String(value);
}

function arrayDiffValue(value: unknown): AuditDiff["before"] {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value.map(readableArrayItem).join("\n") : readableArrayItem(value);
}

function flattenSnapshot(value: unknown, prefix = ""): Record<string, AuditDiff["before"]> {
  if (value === null || value === undefined) return prefix ? { [prefix]: null } : {};
  if (Array.isArray(value)) return { [prefix || "items"]: arrayDiffValue(value) };
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        Object.entries(flattenSnapshot(item, prefix ? `${prefix}.${key}` : key)),
      ),
    );
  }
  return {
    [prefix || "value"]:
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value
        : null,
  };
}

export function diffFor(before: unknown, after: unknown): AuditDiff[] {
  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeValue = arrayDiffValue(before);
    const afterValue = arrayDiffValue(after);
    return beforeValue === afterValue
      ? []
      : [{ after: afterValue, before: beforeValue, field: "items" }];
  }
  const beforeRecord = flattenSnapshot(before);
  const afterRecord = flattenSnapshot(after);
  const fields = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  return Array.from(fields).flatMap((field) => {
    const beforeValue = beforeRecord[field] ?? null;
    const afterValue = afterRecord[field] ?? null;
    return beforeValue === afterValue ? [] : [{ after: afterValue, before: beforeValue, field }];
  });
}
