import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";
import { z } from "zod";
import type { ActionPaymentFailure } from "./contract";
import { actionPaymentOptionSchema, paymentDecimalSchema } from "./schema";

const purpose = "action-payment-consent-v1";
const payloadSchema = z
  .object({
    id: z.string().uuid(),
    exp: z.number().int().positive(),
    request: z.string().length(64),
    route: z.string().length(64),
    scope: z.string().length(64),
    source: z.string().min(1),
    option: actionPaymentOptionSchema,
    children: z.record(
      z.string(),
      z.object({
        free: z.boolean(),
        authority: z.string(),
        amount: paymentDecimalSchema,
        providerCostCents: paymentDecimalSchema,
        nativeQuantity: paymentDecimalSchema.nullable(),
        items: z.array(z.string().min(1).max(128)).max(1000).optional(),
      }),
    ),
  })
  .strict();
export type PaymentTokenPayload = z.infer<typeof payloadSchema>;
export class ActionPaymentError extends Error {
  constructor(readonly reason: ActionPaymentFailure) {
    super(reason);
  }
}
function digest(value: string, key: Buffer) {
  return createHmac("sha256", key).update(value).digest();
}
export function paymentFingerprint(value: unknown) {
  return digest(JSON.stringify(value), getPurposeSecretKeys(purpose)[0]).toString("hex");
}
export function createPaymentToken(
  input: Omit<PaymentTokenPayload, "id" | "exp">,
  now = new Date(),
  id: string = randomUUID(),
) {
  const payload = payloadSchema.parse({
    ...input,
    id,
    exp: Math.floor(now.getTime() / 1000) + 600,
  });
  const bytes = Buffer.from(JSON.stringify(payload));
  return {
    payload,
    token: `${bytes.toString("base64url")}.${digest(bytes.toString(), getPurposeSecretKeys(purpose)[0]).toString("base64url")}`,
  };
}
export function readPaymentToken(token: string, now = new Date()): PaymentTokenPayload {
  try {
    if (token.length > 12000) throw new Error();
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) throw new Error();
    const bytes = Buffer.from(encoded, "base64url"),
      supplied = Buffer.from(signature, "base64url");
    const valid = getPurposeSecretKeys(purpose).some((key) => {
      const expected = digest(bytes.toString(), key);
      return expected.length === supplied.length && timingSafeEqual(expected, supplied);
    });
    if (!valid) throw new Error();
    const value = payloadSchema.parse(JSON.parse(bytes.toString()));
    if (now.getTime() >= value.exp * 1000) throw new ActionPaymentError("payment_quote_expired");
    return value;
  } catch (error) {
    if (error instanceof ActionPaymentError) throw error;
    throw new ActionPaymentError("payment_quote_changed");
  }
}
