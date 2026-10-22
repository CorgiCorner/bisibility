import { validateReturnTo } from "@/lib/auth/return-to";

/** Security enrollment may return only to a canonical application path. */
export function validateSecurityReturnTo(value: unknown): string | null {
  const target = validateReturnTo(value);
  if (!target) return null;
  const path = new URL(target, "https://return-to.invalid").pathname;
  // Reject encoded path separators/dot segments rather than relying on browser decoding.
  if (path.includes("%") || !path.startsWith("/app/")) return null;
  return target;
}
