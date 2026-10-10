import { createHash } from "node:crypto";
import type { JsonValue, SourceConfiguration } from "./contract";

export function exactTextHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Identity contains a non-JSON value.");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

export function payloadHash(value: unknown): string {
  return exactTextHash(canonicalJson(value));
}

export function sourceConfigurationHash(configuration: SourceConfiguration): string {
  return payloadHash(configuration);
}

export function boundedUtf8(
  text: string,
  maximumBytes: number,
): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maximumBytes) return { text, truncated: false };
  let output = "";
  let bytes = 0;
  for (const character of text) {
    const width = Buffer.byteLength(character, "utf8");
    if (bytes + width > maximumBytes) break;
    output += character;
    bytes += width;
  }
  return { text: output, truncated: true };
}

export function boundedRaw(raw: JsonValue | null): { raw: JsonValue | null; truncated: boolean } {
  if (raw === null) return { raw, truncated: false };
  const projection = canonicalJson(raw);
  if (Buffer.byteLength(projection, "utf8") <= 512 * 1024) return { raw, truncated: false };
  let lower = 0;
  let upper = projection.length;
  let preview = "";
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = projection.slice(0, middle).replace(/[\uD800-\uDBFF]$/, "");
    if (
      Buffer.byteLength(canonicalJson({ truncated: true, preview: candidate }), "utf8") <=
      512 * 1024
    ) {
      preview = candidate;
      lower = middle + 1;
    } else upper = middle - 1;
  }
  return { raw: { truncated: true, preview }, truncated: true };
}
