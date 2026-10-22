import { acceptedActionPaymentSchema } from "@/lib/action-payment/schema";
import { z } from "zod";
/** Match the signed token reader and REST body bounds, without exposing durable consent. */
export const aiAcceptedPaymentSchema = acceptedActionPaymentSchema.safeExtend({
  quoteToken: z.string().min(1).max(12000),
});
