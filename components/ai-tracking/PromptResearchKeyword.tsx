"use client";
import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import {
  PaymentQuoteSummary,
  quoteAddCreditsHref,
} from "@/components/action-payment/PaymentQuoteSummary";
import { usePaymentQuoteExpiry } from "@/components/action-payment/usePaymentQuoteExpiry";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import {
  lookupPromptResearchAction,
  type PromptResearchPageData,
} from "@/lib/actions/prompt-research";
import { presentBudgetDenial } from "@/lib/ui/action-error";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { PromptResearchTable } from "./PromptResearchTable";

type Lookup = Awaited<ReturnType<typeof lookupPromptResearchAction>>;
function PromptResearchKeywordContent({
  projectId,
  keyword,
  data,
  onSourceMissing,
}: Readonly<{
  projectId: string;
  keyword: string;
  data: PromptResearchPageData;
  onSourceMissing: () => void;
}>) {
  const t = useTranslations("projectAiTracking.research");
  const paymentT = useTranslations("shared.actionPayment");
  const errors = useSharedErrorMessages();
  const locale = useLocale();
  const [outcome, setOutcome] = useState<Lookup | undefined>(data.initial);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const [option, setOption] = useState<string>();
  const estimate = useQuery({
    queryKey: ["prompt-research-quote", projectId, keyword, option],
    queryFn: async () => {
      const next = await lookupPromptResearchAction(projectId, {
        keyword,
        max_cost_cents: 1000,
        estimate_only: true,
        payment_option_id: option,
      });
      if (!next.ok && next.reason === "no_source") onSourceMissing();
      return next;
    },
    enabled:
      data.hasSource &&
      data.canWrite &&
      !outcome &&
      keyword.trim().length > 0 &&
      keyword.trim().length <= 100,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  const display = outcome ?? estimate.data;
  const quote = display?.ok && display.estimate ? display.payment : undefined;
  const expired = usePaymentQuoteExpiry(quote ? Date.parse(quote.expiresAt) : Infinity);
  const failure = display && !display.ok ? display.reason : undefined;
  function run() {
    if (!quote || expired || pending || blocked || !quote.availability.allowed) return;
    startTransition(async () => {
      setFailed(false);
      try {
        const next = await lookupPromptResearchAction(projectId, {
          keyword,
          max_cost_cents: 1000,
          payment_option_id: quote.option.id,
          accepted_payment: { quote_token: quote.quoteToken },
        });
        if (!next.ok && next.reason === "no_source") onSourceMissing();
        setOutcome(next);
        setBlocked(
          Boolean(
            ("retryBlocked" in next && next.retryBlocked) ||
              (next.ok &&
                !next.estimate &&
                (next.result.failure || next.result.costStatus !== "confirmed")),
          ),
        );
      } catch {
        setFailed(true);
        setBlocked(true);
      }
    });
  }
  return (
    <div className="grid min-w-0 gap-3" aria-busy={pending || estimate.isFetching}>
      {!data.canWrite ? <EmptyState title={t("readOnly")} description={t("readOnlyHint")} /> : null}
      {(estimate.isFetching && !display) || pending ? (
        <p role="status" className="text-ui-body text-fg-muted">
          {t(pending ? "loadingResults" : "loadingQuote")}
        </p>
      ) : null}
      {failed || estimate.isError || (failure && failure !== "no_source") ? (
        <Card role="alert" className="text-ui-body text-red-text">
          {presentBudgetDenial(
            failure,
            errors,
            t(failure === "insufficient_credits" ? "insufficientCredits" : "requestFailure"),
          )}
        </Card>
      ) : null}
      {(failed || estimate.isError || (failure && failure !== "no_source")) &&
      !blocked &&
      !pending ? (
        <div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setOutcome(undefined);
              void estimate.refetch();
            }}
          >
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {display?.ok && display.estimate ? (
        <Card className="grid gap-3">
          <PaymentQuoteSummary
            quote={quote}
            options={display.paymentOptions}
            disabled={pending}
            onOptionChange={(next) => {
              setOption(next.id);
              setOutcome(undefined);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={
                expired
                  ? () => {
                      void estimate.refetch();
                    }
                  : run
              }
              href={!expired ? quoteAddCreditsHref(quote) : undefined}
              disabled={
                pending ||
                blocked ||
                (!expired && !quoteAddCreditsHref(quote) && !quote?.availability.allowed)
              }
              loading={pending}
            >
              {expired
                ? paymentT("refreshPrice")
                : quoteAddCreditsHref(quote)
                  ? paymentT("addCredits")
                  : t("confirmResearch")}
              {quote && !expired ? ` · ${formatPaymentAmount(quote.charge, locale)}` : ""}
            </Button>
            <span className="text-ui-xs text-fg-muted">
              {t("cacheHint", { duration: data.cacheDuration })}
            </span>
          </div>
        </Card>
      ) : null}
      {display?.payment && (!display.ok || !display.estimate) ? (
        <PaymentChargeLine payment={display.payment} />
      ) : null}
      {blocked ? (
        <p role="alert" className="text-ui-body text-red-text">
          {t("reviewAttempt")}
        </p>
      ) : null}
      {display?.ok && !display.estimate && "prompts" in display ? (
        <>
          {display.result.failure ? (
            <p role="alert" className="text-ui-body text-red-text">
              {t("partialFailure")}
            </p>
          ) : null}
          {!display.result.failure || display.prompts.length > 0 ? (
            <PromptResearchTable
              cached={display.cached}
              projectId={projectId}
              keyword={keyword}
              reportId={display.reportId}
              prompts={display.prompts}
              topics={data.topics}
              canWrite={data.canWrite}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function PromptResearchKeyword(props: Parameters<typeof PromptResearchKeywordContent>[0]) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <PromptResearchKeywordContent {...props} />
    </QueryClientProvider>
  );
}
