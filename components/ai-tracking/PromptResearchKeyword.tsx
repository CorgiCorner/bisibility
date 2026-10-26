"use client";
import { ActionPaymentLoading } from "@/components/action-payment/ActionPaymentLoading";
import { ActionPaymentReview } from "@/components/action-payment/ActionPaymentReview";
import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { usePaymentQuoteExpiry } from "@/components/action-payment/usePaymentQuoteExpiry";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  lookupPromptResearchAction,
  type PromptResearchPageData,
} from "@/lib/actions/prompt-research";
import { presentBudgetDenial } from "@/lib/ui/action-error";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
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
  const errors = useSharedErrorMessages();
  const [outcome, setOutcome] = useState<Lookup | undefined>(data.initial);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const [option, setOption] = useState<string>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const submitting = useRef(false);
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
      if (next.ok && !next.estimate) {
        setOutcome(next);
        setReviewOpen(false);
      }
      return next;
    },
    enabled:
      reviewOpen &&
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
    if (
      !quote ||
      expired ||
      pending ||
      blocked ||
      estimate.isFetching ||
      submitting.current ||
      !quote.availability.allowed
    )
      return;
    submitting.current = true;
    setReviewOpen(false);
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
      } finally {
        submitting.current = false;
      }
    });
  }
  return (
    <div className="grid min-w-0 gap-3" aria-busy={pending || estimate.isFetching}>
      {!data.canWrite ? <EmptyState title={t("readOnly")} description={t("readOnlyHint")} /> : null}
      {pending ? <ActionPaymentLoading label={t("loadingResults")} /> : null}
      {failed ? (
        <Card role="alert" className="text-ui-body text-red-text">
          {presentBudgetDenial(
            failure,
            errors,
            t(failure === "insufficient_credits" ? "insufficientCredits" : "requestFailure"),
          )}
        </Card>
      ) : null}
      {data.canWrite && !blocked && !pending && !(display?.ok && !display.estimate) ? (
        <div>
          <Button
            onClick={() => {
              setFailed(false);
              setOutcome(undefined);
              setReviewOpen(true);
              void estimate.refetch();
            }}
          >
            {t("startResearch")}
          </Button>
        </div>
      ) : null}
      {reviewOpen ? (
        <ActionPaymentReview
          items={
            quote
              ? [
                  {
                    key: "research",
                    label: keyword,
                    quote,
                    options: display?.ok && display.estimate ? (display.paymentOptions ?? []) : [],
                  },
                ]
              : []
          }
          loading={estimate.isFetching}
          loadingLabel={t("loadingQuote")}
          failed={estimate.isError}
          onClose={() => setReviewOpen(false)}
          onConfirm={run}
          onRefresh={() => {
            setOutcome(undefined);
            void estimate.refetch();
          }}
          onOptionChange={(_key, id) => {
            setOption(id);
            setOutcome(undefined);
          }}
        >
          <p className="m-0 text-ui-xs text-fg-muted">{t("scopeHint")}</p>
          {!estimate.isFetching && failure && failure !== "no_source" ? (
            <p role="alert" className="m-0 text-ui-body text-red-text">
              {presentBudgetDenial(failure, errors, t("requestFailure"))}
            </p>
          ) : null}
          {!estimate.isFetching && (estimate.isError || failure) ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setOutcome(undefined);
                void estimate.refetch();
              }}
            >
              {t("retry")}
            </Button>
          ) : null}
        </ActionPaymentReview>
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
