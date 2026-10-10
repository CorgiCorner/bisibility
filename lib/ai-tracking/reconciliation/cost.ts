import type { CostReceipt, SamplePlan } from "@/lib/ai-tracking/contract";
import type { TrackingEnvelope } from "@/lib/ai-tracking/providers/envelope";
import { Prisma } from "@/lib/generated/prisma/client";

export function usd(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? new Prisma.Decimal(value).toFixed()
    : null;
}
export function trackingCostReceipt(input: {
  plan: Pick<SamplePlan, "source" | "endpoint">;
  envelope: TrackingEnvelope;
  ledgerId: string | null;
  previous?: CostReceipt | null;
  retrieval: boolean;
}): CostReceipt {
  const task = input.envelope.tasks?.[0];
  const cost = usd(task?.cost);
  const base = {
    providerCostEntryId: input.ledgerId ?? input.previous?.providerCostEntryId ?? null,
  };
  if (input.retrieval && cost === "0") {
    const spent = task?.result?.[0]?.money_spent;
    if (input.plan.source === "model_api" && typeof spent === "number" && usd(spent) !== null)
      return {
        ...base,
        amountUsd: new Prisma.Decimal(spent)
          .plus(input.plan.endpoint.endsWith("task_post") ? "0.0002" : "0.0006")
          .toFixed(),
        state: "derived",
      };
    return input.previous ?? { ...base, amountUsd: null, state: "unknown" };
  }
  if (cost === null) return input.previous ?? { ...base, amountUsd: null, state: "unknown" };
  return {
    ...base,
    amountUsd: cost,
    state:
      input.plan.source === "model_api" &&
      !input.retrieval &&
      input.plan.endpoint.endsWith("task_post")
        ? "refund_pending"
        : "confirmed",
  };
}
