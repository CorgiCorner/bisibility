import { createUsageNumberFormat } from "@/components/metering/usage-number-format";
import type { CreditUsageView, FundingOptionView } from "@/lib/assistant/wire";

/** A Credits amount in customer cents, in the same currency reading as a project limit. */
export function money(locale: string, cents: string) {
  return (
    createUsageNumberFormat(locale).budgetFigure({
      text: cents,
      unit: "budget_cents",
      certainty: "measured",
    }) ?? cents
  );
}

/** Same currency reading as a project limit: spent, or spent of the cap. */
export function creditUsageLabel(
  usage: CreditUsageView,
  locale: string,
): { used: string; limit: string | null } {
  return {
    used: money(locale, usage.usedCents),
    limit: usage.limitCents === null ? null : money(locale, usage.limitCents),
  };
}

export type FundingMenuText = (key: string, values?: Record<string, string>) => string;

/** Secondary funding label: monthly credits, a saved key, or the unavailable reason. */
export function fundingMenuSecondary(
  item: FundingOptionView,
  locale: string,
  text: FundingMenuText,
) {
  if (!item.available) return text(`errors.${item.reason ?? "not_configured"}`);
  if (item.mode === "credits" && item.usage) {
    const spent = creditUsageLabel(item.usage, locale);
    return spent.limit
      ? text("creditsUsed", { used: spent.used, limit: spent.limit })
      : text("creditsUsedOpen", { used: spent.used });
  }
  if (!item.credential) return "";
  return text("keyLast4", {
    last4: item.credential.last4,
    status: text(item.credential.status === "active" ? "credentialActive" : "credentialInvalid"),
  });
}
