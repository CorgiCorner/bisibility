"use client";

import { ActionPaymentReview } from "@/components/action-payment/ActionPaymentReview";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button } from "@/components/ui/Button";
import { presentBudgetDenial } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";
import type { useResearchLookup } from "./use-research-lookup";

type LookupState = ReturnType<typeof useResearchLookup>;

export function ResearchPaymentDialog({
  keyword,
  lookup,
}: Readonly<{ keyword: string; lookup: LookupState }>) {
  const t = useTranslations("projectAiTracking.research");
  const errors = useSharedErrorMessages();
  if (!lookup.reviewOpen) return null;
  const { display, estimate, failure, quote } = lookup;
  return (
    <ActionPaymentReview
      failed={estimate.isError}
      items={
        quote
          ? [
              {
                key: "research",
                label: keyword,
                options: display?.ok && display.estimate ? (display.paymentOptions ?? []) : [],
                quote,
              },
            ]
          : []
      }
      loading={estimate.isFetching}
      loadingLabel={t("loadingQuote")}
      onClose={() => lookup.setReviewOpen(false)}
      onConfirm={lookup.run}
      onOptionChange={(_key, id) => {
        lookup.setOption(id);
        lookup.setOutcome(undefined);
      }}
      onRefresh={() => {
        lookup.setOutcome(undefined);
        void estimate.refetch();
      }}
    >
      <p className="m-0 text-ui-caption text-fg-muted">{t("scopeHint")}</p>
      {!estimate.isFetching && failure && failure !== "no_source" ? (
        <p className="m-0 text-ui-body text-red-text" role="alert">
          {presentBudgetDenial(failure, errors, t("requestFailure"))}
        </p>
      ) : null}
      {!estimate.isFetching && (estimate.isError || failure) ? (
        <Button
          onClick={() => {
            lookup.setOutcome(undefined);
            void estimate.refetch();
          }}
          size="sm"
          variant="secondary"
        >
          {t("retry")}
        </Button>
      ) : null}
    </ActionPaymentReview>
  );
}
