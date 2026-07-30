export type AuditDiff = {
  after: string | number | boolean | null;
  before: string | number | boolean | null;
  field: string;
};

const ARRAY_LABEL_KEYS = ["text", "name", "publicId"] as const;

function toDiffValue(value: unknown): AuditDiff["before"] {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value, null, 2) ?? null;
}

function readableArrayItem(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ARRAY_LABEL_KEYS) {
      const label = record[key];
      if (typeof label === "string" && label.trim()) {
        return label;
      }
    }
    return JSON.stringify(value);
  }
  return String(toDiffValue(value));
}

function arrayDiffValue(value: unknown): AuditDiff["before"] {
  if (!Array.isArray(value)) {
    return toDiffValue(value);
  }
  return value.length > 0 ? value.map(readableArrayItem).join("\n") : "[]";
}

function snapshotRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return value === null || value === undefined ? {} : { value };
}

export function diffFor(before: unknown, after: unknown): AuditDiff[] {
  if (before === null && after === null) {
    return [];
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeValue = arrayDiffValue(before);
    const afterValue = arrayDiffValue(after);
    return beforeValue === afterValue
      ? []
      : [{ after: afterValue, before: beforeValue, field: "items" }];
  }

  const beforeRecord = snapshotRecord(before);
  const afterRecord = snapshotRecord(after);
  const fields = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  return Array.from(fields).flatMap((field) => {
    const beforeValue = toDiffValue(beforeRecord[field]);
    const afterValue = toDiffValue(afterRecord[field]);
    return beforeValue === afterValue ? [] : [{ after: afterValue, before: beforeValue, field }];
  });
}
