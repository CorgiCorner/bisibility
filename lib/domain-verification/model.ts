import { randomBytes } from "node:crypto";
import { getDomain } from "tldts";
import { z } from "zod";

export const verificationInputSchema = z
  .object({
    method: z.enum(["dns_txt", "search_console"]),
  })
  .strict();
export type VerificationMethod = z.infer<typeof verificationInputSchema>["method"];
export type CheckResult = "verified" | "missing" | "timeout" | "unavailable";

// Allow two missed daily rechecks, but never extend validity on a failed check.
export const VERIFICATION_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export function hasRecentVerification(
  row: { verifiedAt: Date | null; revokedAt: Date | null },
  now = new Date(),
) {
  if (!row.verifiedAt || row.revokedAt) return false;
  const age = now.getTime() - row.verifiedAt.getTime();
  return age >= 0 && age < VERIFICATION_MAX_AGE_MS;
}

export function domainHost(value: string): string {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !getDomain(host, { allowPrivateDomains: true }) ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("A public domain is required.");
  return host;
}
export function domainApex(value: string): string {
  return getDomain(domainHost(value), { allowPrivateDomains: true }) as string;
}

export function newVerificationToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let token = "";
  for (const byte of randomBytes(32)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      token += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) token += alphabet[(value << (5 - bits)) & 31];
  return token;
}

export function nextVerificationState(
  previous: { failures: number; verifiedAt: Date | null },
  verified: boolean,
  now = new Date(),
) {
  if (verified) return { failures: 0, verifiedAt: now };
  const failures = Math.min(previous.failures + 1, 3);
  return { failures, verifiedAt: failures >= 3 ? null : previous.verifiedAt };
}
