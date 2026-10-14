import { z } from "zod";
/** Seconds are display units only; retained duration remains exact integer milliseconds. */
export function freshnessSecondsText(milliseconds: number | null): string {
  if (milliseconds === null) return "";
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
    throw new Error("Invalid freshness duration.");
  const value = BigInt(milliseconds),
    fraction = (value % 1000n).toString().padStart(3, "0").replace(/0+$/u, "");
  return `${value / 1000n}${fraction ? `.${fraction}` : ""}`;
}
export function parseFreshnessSeconds(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  const match = /^(0|[1-9]\d{0,13})(?:[.,](\d{1,3}))?$/u.exec(value);
  if (!match) throw new Error("Invalid freshness duration.");
  const milliseconds = BigInt(match[1]) * 1000n + BigInt((match[2] ?? "").padEnd(3, "0") || "0");
  if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Invalid freshness duration.");
  return Number(milliseconds); // A proven safe bounded duration, never money or provider-native decimal.
}

const freshnessSecondsSchema = z
  .string()
  .max(32)
  .refine((text) => {
    try {
      parseFreshnessSeconds(text);
      return true;
    } catch {
      return false;
    }
  }, "Invalid freshness duration.");
/** Client-safe form schema; the server configuration schema independently validates authoritative milliseconds. */
export const measurementFreshnessFormSchema = z
  .object({
    manualSeconds: freshnessSecondsSchema,
    graceSeconds: freshnessSecondsSchema,
  })
  .strict();
export type MeasurementFreshnessForm = z.infer<typeof measurementFreshnessFormSchema>;
