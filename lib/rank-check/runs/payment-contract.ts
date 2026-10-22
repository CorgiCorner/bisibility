import { actionPaymentOptionSchema, paymentDecimalSchema } from "@/lib/action-payment/schema";
import { z } from "zod";
export const retainedRankPaymentSchema = z
  .object({
    version: z.literal(1),
    runPublicId: z.string(),
    projectId: z.string(),
    ownerId: z.string(),
    actorId: z.string().nullable(),
    source: z.string(),
    quoteId: z.string(),
    option: actionPaymentOptionSchema,
    route: z.string(),
    connectionId: z.string(),
    connectionRevision: z.string().nullable(),
    credentialFingerprint: z.string(),
    authority: z.string(),
    targets: z.array(
      z
        .object({
          keywordId: z.string(),
          cost: z.number().nonnegative(),
          depth: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]),
          quantity: paymentDecimalSchema,
          amount: paymentDecimalSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type RetainedRankPayment = z.infer<typeof retainedRankPaymentSchema>;
