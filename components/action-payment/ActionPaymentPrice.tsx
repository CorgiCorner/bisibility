"use client";

import type { ActionPaymentQuote } from "@/lib/action-payment/contract";
import { actionPaymentQuoteSchema } from "@/lib/action-payment/schema";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { usePaymentAmountFormatter } from "./use-payment-amount-formatter";

type Props = {
  action: (input: unknown) => Promise<unknown>;
  cachedLabel?: string;
  input: Record<string, unknown> | null;
};

function QuotePrice({ action, cachedLabel, input }: Props) {
  const presentAmount = usePaymentAmountFormatter();
  const t = useTranslations("shared.actionPayment");
  const query = useQuery<ActionPaymentQuote>({
    queryKey: ["action-payment-price", input],
    enabled: Boolean(input),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: (current) =>
      current.state.data
        ? Math.min(
            2_147_483_646,
            Math.max(0, Date.parse(current.state.data.expiresAt) - Date.now()),
          )
        : 0,
    queryFn: async () => {
      const result = await action({ ...input, estimateOnly: true, requirePayment: true });
      if (
        !result ||
        typeof result !== "object" ||
        !("ok" in result) ||
        !result.ok ||
        !("estimate" in result) ||
        result.estimate !== true ||
        !("payment" in result)
      )
        throw new Error("payment_unavailable");
      return actionPaymentQuoteSchema.parse(result.payment);
    },
  });
  const quote = query.data;
  const ready = Boolean(quote) && !query.isStale;
  const cached = ready && quote?.cache.state === "hit" && cachedLabel;
  const presented = ready && quote && !cached ? presentAmount(quote.charge) : null;
  return (
    <span className="font-sans tabular-nums" title={presented?.title}>
      {cached ? cachedLabel : (presented?.text ?? t("reviewPrice"))}
    </span>
  );
}

export function ActionPaymentPrice(props: Props) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <QuotePrice {...props} />
    </QueryClientProvider>
  );
}
