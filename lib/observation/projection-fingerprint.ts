import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Projection time is invalid.");
    return value.toISOString();
  }
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Projection number is invalid.");
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  throw new Error("Projection contains an unsupported value.");
}

export function projectionFingerprint(input: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
}
