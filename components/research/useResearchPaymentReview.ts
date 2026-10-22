"use client";

import type { PaymentReviewItem } from "@/components/action-payment/ActionPaymentReview";
import type {
  AcceptedActionPayment,
  ActionPaymentBatchAssessment,
} from "@/lib/action-payment/contract";
import type {
  assessResearchPaymentsAction,
  ResearchKeywordsAction,
  ResearchKeywordsActionInput,
} from "@/lib/actions/keyword-research";
import { isKeywordResearchEstimate } from "@/lib/keyword-research/types";
import type { ResearchScope } from "@/lib/research/scope";
import { useRef, useState } from "react";
import { uniqueResearchSeeds } from "./research-tab-identity";
import { researchScopeLocationKey } from "./research-workspace-model";

type Approval = ResearchKeywordsActionInput & {
  paymentOptionId: string;
  acceptedPayment: AcceptedActionPayment;
};
type Draft = {
  revision: number;
  seeds: string[];
  overrides: Partial<ResearchKeywordsActionInput>;
  scope: ResearchScope;
  items: PaymentReviewItem[];
  requests: Record<string, ResearchKeywordsActionInput>;
  loading: boolean;
  failed: boolean;
  assessment?: ActionPaymentBatchAssessment;
};

export function useResearchPaymentReview(
  action: ResearchKeywordsAction,
  input: (
    seed: string,
    overrides?: Partial<ResearchKeywordsActionInput>,
  ) => ResearchKeywordsActionInput,
  run: (
    seeds: string[],
    overrides: Partial<ResearchKeywordsActionInput>,
    scope: ResearchScope,
    approvals: Record<string, Approval>,
  ) => Promise<void>,
  assess: typeof assessResearchPaymentsAction = async (request) =>
    (await import("@/lib/actions/keyword-research")).assessResearchPaymentsAction(request),
) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const sequence = useRef(0);

  async function review(
    seeds: string[],
    overrides: Partial<ResearchKeywordsActionInput>,
    scope: ResearchScope,
    frozenRequests?: Record<string, ResearchKeywordsActionInput>,
  ) {
    const revision = ++sequence.current;
    const next = {
      revision,
      seeds: uniqueResearchSeeds(seeds),
      overrides: structuredClone({ ...overrides, locationKey: researchScopeLocationKey(scope) }),
      scope: structuredClone(scope),
      items: [],
      loading: true,
      failed: false,
      requests: structuredClone(
        frozenRequests ??
          Object.fromEntries(
            uniqueResearchSeeds(seeds).map((seed) => [
              seed,
              input(seed, {
                ...overrides,
                locationKey: researchScopeLocationKey(scope),
                estimateOnly: true,
              }),
            ]),
          ),
      ),
    };
    setDraft(next);
    try {
      const items = await Promise.all(
        next.seeds.map(async (seed) => {
          const result = await action(next.requests[seed]);
          if (!result.ok || !isKeywordResearchEstimate(result) || !result.payment)
            throw new Error("payment_unavailable");
          return {
            key: seed,
            label: seed,
            quote: result.payment,
            options: result.paymentOptions ?? [],
          };
        }),
      );
      if (revision !== sequence.current) return;
      const assessment = await assess({
        projectId: next.requests[next.seeds[0]].projectId,
        quotes: items.map(({ quote }) => ({ quoteToken: quote.quoteToken })),
      });
      if (revision === sequence.current) setDraft({ ...next, items, assessment, loading: false });
    } catch {
      if (revision === sequence.current) setDraft({ ...next, loading: false, failed: true });
    }
  }

  async function changeOption(key: string, paymentOptionId: string) {
    if (!draft) return;
    const current = draft;
    const option = current.items
      .find((item) => item.key === key)
      ?.options.find((item) => item.id === paymentOptionId);
    if (!option) return;
    const selectedInput = {
      ...current.requests[key],
      connectionId: option.connectionId,
      paymentOptionId,
    };
    const revision = ++sequence.current;
    setDraft({ ...current, revision, loading: true, failed: false });
    try {
      const result = await action({ ...selectedInput, estimateOnly: true });
      if (
        !result.ok ||
        !isKeywordResearchEstimate(result) ||
        !result.payment ||
        result.payment.option.id !== paymentOptionId
      )
        throw new Error("payment_unavailable");
      if (revision !== sequence.current) return;
      const quote = result.payment;
      const items = current.items.map((item) =>
        item.key === key ? { ...item, quote, options: result.paymentOptions ?? [] } : item,
      );
      const assessment = await assess({
        projectId: selectedInput.projectId,
        quotes: items.map(({ quote }) => ({ quoteToken: quote.quoteToken })),
      });
      if (revision === sequence.current)
        setDraft({
          ...current,
          revision,
          requests: { ...current.requests, [key]: selectedInput },
          items,
          assessment,
          loading: false,
        });
    } catch {
      if (revision === sequence.current)
        setDraft({ ...current, revision, loading: false, failed: true });
    }
  }

  function refresh() {
    if (draft && !draft.loading)
      void review(draft.seeds, draft.overrides, draft.scope, draft.requests);
  }

  function close() {
    sequence.current += 1;
    setDraft(null);
  }
  function confirm() {
    if (
      !draft ||
      draft.revision !== sequence.current ||
      draft.loading ||
      draft.failed ||
      !draft.assessment?.allowed ||
      !draft.items.length ||
      draft.items.some(
        ({ quote }) => !quote.availability.allowed || Date.parse(quote.expiresAt) <= Date.now(),
      )
    )
      return;
    const approvals = Object.fromEntries(
      draft.items.map(({ key, quote }) => [
        key,
        {
          ...draft.requests[key],
          paymentOptionId: quote.option.id,
          acceptedPayment: { quoteToken: quote.quoteToken },
        },
      ]),
    );
    const accepted = draft;
    close();
    void run(accepted.seeds, accepted.overrides, accepted.scope, approvals);
  }
  return { draft, review, changeOption, close, confirm, refresh };
}
