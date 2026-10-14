import { createHash } from "node:crypto";
import type { ProviderRequest } from "@usagekit/providers";
import type { LocalKeywordSnapshot } from "./context";

function canonical(value: unknown): unknown {
  if (value instanceof Uint8Array) return { bytes: Array.from(value) };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function localDigest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function localKeywordSourceHash(keyword: LocalKeywordSnapshot) {
  return localDigest({
    id: keyword.id,
    text: keyword.text,
    device: keyword.device,
    locationId: keyword.locationId,
  });
}
export function localRequestHash(request: ProviderRequest) {
  return localDigest(request);
}
export function requireLocalTime(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new RangeError("Invalid local measurement clock.");
  return new Date(value.getTime());
}

export function freezeLocalInput<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeLocalInput(child);
    Object.freeze(value);
  }
  return value;
}

/** Exact persisted target/policy epochs form one opaque Local keyword revision. No numeric coercion. */
export function localKeywordRevision(
  keyword: Readonly<{
    measurementTargetEpoch: unknown;
    measurementPolicyEpoch: unknown;
  }>,
) {
  const epoch = (value: unknown) => {
    const text = typeof value === "bigint" ? value.toString() : value;
    if (
      typeof text !== "string" ||
      !/^(0|[1-9]\d*)$/u.test(text) ||
      text.length > 19 ||
      BigInt(text) > 9223372036854775807n
    )
      throw new RangeError("A canonical persisted keyword epoch is required.");
    return text;
  };
  return `${epoch(keyword.measurementTargetEpoch)}:${epoch(keyword.measurementPolicyEpoch)}`;
}
