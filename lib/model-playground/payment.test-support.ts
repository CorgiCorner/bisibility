import type { ModelPaymentContext } from "./payment";
import { pricedBinding } from "./usage.test-support";

export function paymentContext(count = 1): ModelPaymentContext {
  const bound = pricedBinding();
  const columns = Array.from({ length: count }, () => ({
    binding: {
      ...structuredClone(bound),
      column: { ...structuredClone(bound.column), columnId: crypto.randomUUID() },
    },
    catalogRevision: "catalog-v1",
    maxOutputTokens: 4096,
    forecast: {
      amount: "0.05",
      currency: "USD",
      certainty: "estimated" as const,
      basis: "rate_card" as const,
      rateCardVersion: "rates-v1",
    },
    advisory: { cents: "5", basis: "rate_card" as const },
  }));
  return {
    namespace: "fixture",
    actorId: "actor",
    projectId: bound.projectId,
    principal: bound.principal,
    input: {
      version: 1,
      prompt: "Question",
      responseLanguage: "en",
      columns: columns.map((c) => c.binding.column),
    },
    budget: { id: "project-budget", version: 1 },
    columns,
  };
}
