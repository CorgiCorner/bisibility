import { createHash } from "node:crypto";
import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";

export function contentKey(namespace: string, values: readonly unknown[]) {
  return `${namespace}:${createHash("sha256").update(JSON.stringify(values)).digest("hex")}`;
}

export const compareCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function requireToken(value: string, label: string) {
  if (!value || value.length > 512 || value.trim() !== value || hasAsciiControlCharacters(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function isoTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    throw new Error("Expected canonical ISO timestamp");
  }
  return time;
}
