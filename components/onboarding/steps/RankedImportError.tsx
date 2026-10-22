"use client";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { WalletBudgetNotice } from "@/components/i18n/WalletBudgetNotice";
import { feedbackClass } from "@/components/onboarding/onboarding-form-utils";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { KeywordRankedImportMessages } from "./KeywordRankedImport";
import type { RankedKeywordError } from "./keyword-ranked-model";

export function RankedImportError({
  messages,
  projectRef,
  reason,
  budgetReason,
}: Readonly<{
  messages: KeywordRankedImportMessages;
  projectRef: string;
  reason: RankedKeywordError;
  budgetReason?: "budget_missing" | "usage_reconciliation_required";
}>) {
  const errors = useSharedErrorMessages();
  const paymentT = useTranslations("shared.actionPayment");
  if (reason === "wallet_budget_exhausted") return <WalletBudgetNotice />;
  const message =
    budgetReason === "budget_missing"
      ? errors.budgetMissing()
      : budgetReason === "usage_reconciliation_required"
        ? errors.usageReconciliationRequired()
        : {
            budget_exhausted: messages.budgetExhausted,
            insufficient_credits: paymentT("insufficientCredits"),
            own_credentials_required: messages.noSource,
            cost_limit_exceeded: messages.lookupFailed,
            needs_reauth: messages.needsReauth,
            no_domain: messages.noDomain,
            no_source: messages.noSource,
            rate_limited: messages.rateLimited,
            unsupported_location: messages.unsupportedLocation,
            provider_error: messages.lookupFailed,
            payment_quote_changed: messages.lookupFailed,
            payment_quote_expired: messages.lookupFailed,
            payment_quote_required: messages.lookupFailed,
            payment_unavailable: messages.lookupFailed,
            payment_already_executed: messages.lookupFailed,
          }[reason];
  return (
    <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>
      {message}
      {reason === "needs_reauth" ? (
        <Link
          className="ml-1 font-semibold text-accent-text"
          href={appPath(projectRef, "integrations")}
        >
          {messages.reconnect}
        </Link>
      ) : null}
      {reason === "budget_exhausted" && !budgetReason ? (
        <Link
          className="ml-1 font-semibold text-accent-text"
          href={`${appPath(projectRef, "settings")}#provider-usage`}
        >
          {messages.raiseBudget}
        </Link>
      ) : null}
    </p>
  );
}
