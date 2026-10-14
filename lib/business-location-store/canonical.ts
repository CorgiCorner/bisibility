import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}
export function businessDigest(value: unknown) {
  const serialized = JSON.stringify(canonical(value));
  if (serialized === undefined) throw new Error("A canonical business mutation value is required.");
  return createHash("sha256").update(serialized).digest("hex");
}
