import { createHash } from "node:crypto";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type { ReserveInput } from "@usagekit/core";
import { z } from "zod";
import type { PaidAttemptInput } from "./paid-attempt-types";

const id = z.string().min(1).max(256);
export const paidAttemptContextSchema = z
  .object({
    projectId: id,
    connectionId: id,
    publicConnectionId: id,
    providerCredentialVersion: id,
    correlationId: id,
    keywordId: id.optional(),
    rankCheckId: id.optional(),
    rankCheckRunId: id.optional(),
    rankCheckRunItemId: id.optional(),
    trigger: id.optional(),
    tag: id.optional(),
  })
  .strict();
export const platformAllocationTag = (provider: string, connection: string) =>
  createHash("sha256")
    .update(JSON.stringify(["platform-allocation", provider, connection]))
    .digest("hex");

/** Caller-supplied derived amounts never override the frozen funding-specific quote. */
export function preparePaidAttempt(input: PaidAttemptInput): ReserveInput {
  const context = paidAttemptContextSchema.parse(input.context);
  const request = input.reservation;
  if (
    request.scope.group !== context.projectId ||
    request.scope.connection !== context.connectionId ||
    request.scope.providerCredentialVersion !== context.providerCredentialVersion ||
    (request.correlationId && request.correlationId !== context.correlationId)
  )
    throw new Error("Paid attempt context disagrees with financial identity");
  const platform = request.fundingSource === "platform";
  const quote = input.platformQuote;
  if (
    platform &&
    (!quote?.creditAccountRef ||
      !quote.customerPriceVersion ||
      !quote.costOwner ||
      !quote.platformPools.length ||
      !["measured", "list"].includes(quote.estimateSource))
  )
    throw new Error("Platform paid attempt requires a frozen host quote");
  const estimates = platform ? quote?.estimate : request.estimate;
  const source = platform ? quote?.estimateSource : request.estimateSource;
  const cents = estimates?.find((q) => q.unit === "cents");
  const valuation = platform ? estimates?.find((q) => q.unit === "customer_cents") : cents;
  if (
    !cents ||
    !valuation ||
    source === "unknown" ||
    cents.value < 0n ||
    valuation.value < 0n ||
    (platform && valuation.value === 0n)
  )
    throw new Error("Paid attempt requires a priced exact quote");
  if (
    !platform &&
    (input.platformQuote ||
      request.creditAccountRef ||
      request.customerPriceVersion ||
      request.platformPools?.length ||
      estimates?.some((q) => q.unit === "customer_cents"))
  )
    throw new Error("Own-key quotes cannot carry platform funding");
  const tag = platform
    ? platformAllocationTag(request.provider, context.connectionId)
    : ownAllocationTag(request.provider, context.connectionId);
  const oppositeTag = platform
    ? ownAllocationTag(request.provider, context.connectionId)
    : platformAllocationTag(request.provider, context.connectionId);
  const tags = [
    ...new Set([...(request.scope.tags ?? []).filter((value) => value !== oppositeTag), tag]),
  ];
  return {
    ...request,
    scope: { ...request.scope, tags },
    correlationId: context.correlationId,
    ...(platform && quote
      ? {
          costOwner: quote.costOwner,
          creditAccountRef: quote.creditAccountRef,
          customerPriceVersion: quote.customerPriceVersion,
          platformPools: quote.platformPools,
          estimateSource: quote.estimateSource,
          providerPriceVersion: quote.providerPriceVersion,
        }
      : {}),
    estimate: [
      ...(estimates ?? []).filter((q) => !["budget_cents", "paid_attempts"].includes(q.unit)),
      { ...valuation, unit: "budget_cents" },
      { value: 1n, scale: 0, unit: "paid_attempts" },
    ],
  };
}
