"use client";

import { usePaymentQuoteExpiry } from "@/components/action-payment/usePaymentQuoteExpiry";
import {
  lookupPromptResearchAction,
  type PromptResearchPageData,
} from "@/lib/actions/prompt-research";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, useTransition } from "react";

type Lookup = Awaited<ReturnType<typeof lookupPromptResearchAction>>;

export function useResearchLookup({
  data,
  keyword,
  onSourceMissing,
  projectId,
}: Readonly<{
  data: PromptResearchPageData;
  keyword: string;
  onSourceMissing: () => void;
  projectId: string;
}>) {
  const seededResult = data.initial?.ok && !data.initial.estimate ? data.initial : undefined;
  const seededQuote = data.initial?.ok && data.initial.estimate ? data.initial : undefined;
  const initialNoSource = Boolean(
    data.initial && !data.initial.ok && data.initial.reason === "no_source",
  );
  const [outcome, setOutcome] = useState<Lookup | undefined>(seededResult);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const [option, setOption] = useState<string>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const submitting = useRef(false);
  const ready = keyword.trim().length > 0 && keyword.trim().length <= 100;
  const estimate = useQuery({
    enabled:
      data.hasSource &&
      data.canWrite &&
      ready &&
      !outcome &&
      !initialNoSource &&
      (option !== undefined || !seededQuote),
    queryFn: async () => {
      const next = await lookupPromptResearchAction(projectId, {
        estimate_only: true,
        keyword,
        max_cost_cents: 1000,
        payment_option_id: option,
      });
      if (!next.ok && next.reason === "no_source") onSourceMissing();
      if (next.ok && !next.estimate) {
        setOutcome(next);
        setReviewOpen(false);
      }
      return next;
    },
    queryKey: ["prompt-research-quote", projectId, keyword, option],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });
  const display = outcome ?? estimate.data ?? seededQuote;
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
          accepted_payment: { quote_token: quote.quoteToken },
          keyword,
          max_cost_cents: 1000,
          payment_option_id: quote.option.id,
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

  return {
    blocked,
    display,
    estimate,
    expired,
    failed,
    failure,
    pending,
    quote,
    reviewOpen,
    run,
    setOption,
    setOutcome,
    setReviewOpen,
  };
}
