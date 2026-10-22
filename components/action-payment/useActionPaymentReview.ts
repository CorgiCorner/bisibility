"use client";

import type {
  ActionPaymentBatchAssessment,
  ActionPaymentOption,
  ActionPaymentQuote,
} from "@/lib/action-payment/contract";
import { actionPaymentOptionSchema, actionPaymentQuoteSchema } from "@/lib/action-payment/schema";
import type { assessActionPaymentsAction } from "@/lib/actions/action-payment";
import { useRef, useState } from "react";

type Input = Record<string, unknown> & { projectId: string };
type Action = (input: unknown) => Promise<unknown>;
type SelectRoute = (input: Input, option: ActionPaymentOption) => Input;
type Pending = {
  revision: number;
  input: Input;
  action: Action;
  selectRoute: SelectRoute;
  quote: ActionPaymentQuote | null;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};
export type ActionPaymentDraft = {
  label: string;
  loading: boolean;
  failed: boolean;
  quote?: ActionPaymentQuote;
  options: ActionPaymentOption[];
  assessment?: ActionPaymentBatchAssessment;
};

function estimatePayment(result: unknown) {
  if (
    !result ||
    typeof result !== "object" ||
    !("ok" in result) ||
    result.ok !== true ||
    !("estimate" in result) ||
    result.estimate !== true ||
    !("payment" in result)
  )
    throw new Error("payment_unavailable");
  const quote = actionPaymentQuoteSchema.parse(result.payment);
  const options =
    "paymentOptions" in result
      ? actionPaymentOptionSchema.array().parse(result.paymentOptions ?? [])
      : [];
  return { quote, options };
}

export function useActionPaymentReview(
  assess: typeof assessActionPaymentsAction = async (input) =>
    (await import("@/lib/actions/action-payment")).assessActionPaymentsAction(input),
) {
  const pending = useRef<Pending | null>(null);
  const revision = useRef(0);
  const [draft, setDraft] = useState<ActionPaymentDraft | null>(null);

  async function quoteRequest(current: Pending, label: string) {
    setDraft({ label, loading: true, failed: false, options: [] });
    current.quote = null;
    try {
      const { quote, options } = estimatePayment(
        await current.action({ ...current.input, estimateOnly: true, requirePayment: true }),
      );
      if (pending.current !== current) return;
      const assessment = await assess({
        projectId: current.input.projectId,
        quotes: [{ quoteToken: quote.quoteToken }],
      });
      if (pending.current !== current) return;
      current.quote = quote;
      setDraft({ label, quote, options, assessment, loading: false, failed: false });
    } catch {
      if (pending.current === current)
        setDraft({ label, loading: false, failed: true, options: [] });
    }
  }

  function request<Result>(
    action: (input: unknown) => Promise<Result>,
    input: Input,
    label: string,
    selectRoute: SelectRoute = (value, option) => ({ ...value, paymentOptionId: option.id }),
  ): Promise<Result | null> {
    pending.current?.resolve(null);
    return new Promise<Result | null>((resolve, reject) => {
      const current: Pending = {
        revision: ++revision.current,
        input: structuredClone(input),
        action,
        selectRoute,
        quote: null,
        resolve: (value) => resolve(value as Result | null),
        reject,
      };
      pending.current = current;
      void quoteRequest(current, label);
    });
  }

  function close() {
    pending.current?.resolve(null);
    pending.current = null;
    revision.current += 1;
    setDraft(null);
  }

  function selectOption(_key: string, id: string) {
    const option = draft?.options.find((item) => item.id === id);
    const current = pending.current;
    if (!current || !option || !draft) return;
    const next = {
      ...current,
      revision: ++revision.current,
      input: current.selectRoute(current.input, option),
      quote: null,
    };
    pending.current = next;
    void quoteRequest(next, draft.label);
  }

  function refresh() {
    const current = pending.current;
    if (current && draft && !draft.loading) void quoteRequest(current, draft.label);
  }

  function confirm() {
    const current = pending.current;
    const quote = current?.quote;
    if (
      !current ||
      !quote ||
      current.revision !== revision.current ||
      !draft?.assessment?.allowed ||
      draft.loading ||
      draft.failed ||
      !quote.availability.allowed
    )
      return;
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      void quoteRequest(current, draft.label);
      return;
    }
    pending.current = null;
    revision.current += 1;
    setDraft(null);
    void current
      .action({
        ...current.input,
        paymentOptionId: quote.option.id,
        acceptedPayment: { quoteToken: quote.quoteToken },
        estimateOnly: false,
        requirePayment: true,
      })
      .then(current.resolve, current.reject);
  }

  return { draft, request, close, confirm, refresh, selectOption };
}
