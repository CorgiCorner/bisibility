export function opaqueIdentifier(value: unknown) {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) return null;
  if (typeof value === "bigint" && value < 0n) return null;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint")
    return null;
  const text = String(value).trim();
  return text || null;
}
