import type { AiTrackingSample } from "@/lib/generated/prisma/client";

export function assertTrackingRunRetryable(run: {
  samples: Pick<AiTrackingSample, "dispatch" | "receipt">[];
}) {
  const unresolved = run.samples.some((sample) => {
    if (sample.dispatch !== "terminal") return true;
    const receipt = sample.receipt;
    return (
      receipt !== null &&
      typeof receipt === "object" &&
      !Array.isArray(receipt) &&
      typeof receipt.state === "string" &&
      ["unknown", "pending", "refund_pending"].includes(receipt.state)
    );
  });
  if (unresolved)
    throw new Error("Unresolved samples or receipts require reconciliation before retry.");
}
