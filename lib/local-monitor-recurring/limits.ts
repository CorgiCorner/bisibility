import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import { exactCents, recurringQuoteCents } from "./cost";
import type { RecurringApprovalSnapshot } from "./schema";
export function assertRecurringQuote(
  policy: RecurringApprovalSnapshot,
  quote: LocalQuote,
  usedCents: string,
  issued: number,
) {
  if (
    quote.provider !== policy.quote.provider ||
    quote.adapterVersion !== policy.quote.adapterVersion ||
    quote.providerPriceVersion !== policy.quote.providerPriceVersion ||
    quote.capabilityVersion !== policy.quote.capabilityVersion ||
    localDigest(quote.effectiveOptions) !== localDigest(policy.quote.effectiveOptions) ||
    localDigest([...quote.expectedTargetKeys].sort()) !==
      localDigest([...policy.quote.expectedTargetKeys].sort())
  )
    throw new Error("price_or_scope_changed");
  const cents = recurringQuoteCents(quote);
  if (
    exactCents(cents) > exactCents(policy.maximumPerOccurrenceCents) ||
    exactCents(usedCents) + exactCents(cents) > exactCents(policy.maximumTotalCents) ||
    issued >= policy.maximumOccurrences
  )
    throw new Error("ceiling_exhausted");
  return cents;
}
