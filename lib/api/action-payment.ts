import type {
  ActionPaymentOption,
  ActionPaymentQuote,
  ActionPaymentReceipt,
} from "@/lib/action-payment/contract";
import { z } from "zod";
import type { ApiContext } from "./context";
import { errorResponse } from "./responses";
import { snakeizeKeys } from "./surface";
export function paymentAdmissionResponse(
  ctx: ApiContext,
  outcome: { reason: string },
): Response | null {
  if (outcome.reason === "insufficient_credits")
    return errorResponse(
      "credits_exhausted",
      "Available credits do not cover the remaining work. Review retained payment before retrying.",
      402,
      { headers: ctx.headers, instance: ctx.instance },
    );
  if (outcome.reason === "wallet_budget_exhausted")
    return errorResponse("budget_exhausted", "Wallet spending budget reached.", 429, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  if (outcome.reason === "own_credentials_required")
    return errorResponse("byok_required", "This action requires a connected provider key.", 403, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  return null;
}
export const paymentBodyFields = {
  payment_option_id: z.string().min(1).max(120).optional(),
  accepted_payment: z
    .object({ quote_token: z.string().min(1).max(12000) })
    .strict()
    .optional(),
  require_payment: z.boolean().optional(),
};
export function actionPaymentInputFromWire(input: {
  payment_option_id?: string;
  accepted_payment?: { quote_token: string };
  require_payment?: boolean;
}) {
  return {
    paymentOptionId: input.payment_option_id,
    acceptedPayment: input.accepted_payment
      ? { quoteToken: input.accepted_payment.quote_token }
      : undefined,
    requirePayment: input.require_payment,
  };
}

export function paymentResource(result: {
  payment?: ActionPaymentQuote | ActionPaymentReceipt;
  paymentOptions?: ActionPaymentOption[];
}) {
  return {
    ...(result.payment
      ? {
          payment: {
            ...(snakeizeKeys(result.payment) as object),
            kind: "quoteToken" in result.payment ? "quote" : "receipt",
          },
        }
      : {}),
    ...(result.paymentOptions ? { payment_options: snakeizeKeys(result.paymentOptions) } : {}),
  };
}

export async function paymentFailureResponse(
  response: Response,
  result: { payment?: ActionPaymentReceipt },
): Promise<Response> {
  if (!result.payment) return response;
  const body = await response.json();
  return new Response(
    JSON.stringify({ ...body, details: { ...body.details, ...paymentResource(result) } }),
    { status: response.status, headers: response.headers },
  );
}
