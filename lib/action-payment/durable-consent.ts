import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";
import type { z } from "zod";
import { ActionPaymentError } from "./token";

const purpose = "action-payment-accepted-v1";
/** Internal accepted authority. Its payload must bind the concrete durable owner and scope. */
export function sealActionPaymentConsent(payload: unknown) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = getPurposeSecretKeys(purpose)[0];
  if (!key || encoded.length > 500000) throw new ActionPaymentError("payment_unavailable");
  return {
    version: 1 as const,
    encoded,
    signature: createHmac("sha256", key).update(encoded).digest("base64url"),
  };
}
/** Browser quote expiry is checked before capture; it is never a worker execution deadline. */
export function readActionPaymentConsent<T>(sealed: unknown, schema: z.ZodType<T>): T {
  try {
    if (!sealed || typeof sealed !== "object") throw new Error();
    const row = sealed as Record<string, unknown>;
    if (
      row.version !== 1 ||
      typeof row.encoded !== "string" ||
      row.encoded.length > 500000 ||
      typeof row.signature !== "string"
    )
      throw new Error();
    const supplied = Buffer.from(row.signature, "base64url");
    if (
      !getPurposeSecretKeys(purpose).some((key) => {
        const expected = createHmac("sha256", key)
          .update(row.encoded as string)
          .digest();
        return expected.length === supplied.length && timingSafeEqual(expected, supplied);
      })
    )
      throw new Error();
    return schema.parse(JSON.parse(Buffer.from(row.encoded, "base64url").toString()));
  } catch {
    throw new ActionPaymentError("payment_quote_changed");
  }
}
