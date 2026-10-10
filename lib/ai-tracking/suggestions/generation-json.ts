// Browser-safe canonical serialization shared by review validation and the provider payload.
export function generationCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Reviewed context contains a non-JSON value.");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(generationCanonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${generationCanonicalJson(item)}`)
    .join(",")}}`;
}
