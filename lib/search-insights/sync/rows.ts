// Shared coercions for the provider's search analytics payload. Metrics arrive as numbers
// or as numeric strings depending on the field, and a day partition can be large enough
// that it has to reach the database in bounded batches. Both rules live here so a change
// to either is made once.

export function numberValue(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

export function chunk<T>(rows: readonly T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    parts.push(rows.slice(index, index + size));
  }
  return parts;
}
