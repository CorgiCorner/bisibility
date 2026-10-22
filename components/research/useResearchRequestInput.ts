"use client";

import type { ActionPaymentOption } from "@/lib/action-payment/contract";
import type { ResearchKeywordsActionInput } from "@/lib/actions/keyword-research";
import { useState } from "react";

export function useResearchRequestInput(defaults: Omit<ResearchKeywordsActionInput, "seed">) {
  const [selected, selectPaymentOption] = useState<ActionPaymentOption>();
  function requestInput(
    seed: string,
    overrides: Partial<ResearchKeywordsActionInput> = {},
  ): ResearchKeywordsActionInput {
    return {
      ...defaults,
      ...(selected ? { connectionId: selected.connectionId, paymentOptionId: selected.id } : {}),
      seed,
      ...overrides,
    };
  }
  return { requestInput, selectPaymentOption };
}
