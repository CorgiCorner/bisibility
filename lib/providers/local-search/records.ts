import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";
export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function nonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
export function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
export function text(value: unknown, limit = 512): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= limit &&
    !hasAsciiControlCharacters(value)
    ? value
    : null;
}
export function website(value: unknown): string | null {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
