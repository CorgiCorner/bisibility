import type { JsonValue } from "@/lib/ai-tracking/contract";

export const ANSWER_BYTES = 256 * 1024;
export const RAW_BYTES = 512 * 1024;
export function boundedText(value: string, maximum = ANSWER_BYTES) {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    bytes += Buffer.byteLength(character, "utf8");
    if (bytes > maximum) return { value: result, truncated: true };
    result += character;
  }
  return { value: result, truncated: false };
}
export function boundedRaw(value: JsonValue) {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, "utf8") <= RAW_BYTES) return { value, truncated: false };
  // A JSON string projection remains valid even when the original tree is too large.
  return { value: boundedText(encoded, RAW_BYTES / 3).value, truncated: true };
}
