import { initialSubmission } from "@/lib/local-monitoring/submission-state";
import { operationKey } from "@/lib/local-monitoring/target-key";
import { describe, expect, it } from "vitest";
import { submissionRecordSchema } from "./schema";
import { isUnsentLocalProjection } from "./unsent-projection";

const scope = {
  projectId: "project",
  operation: "local_scan_submit" as const,
  idempotencyKey: "key",
};
const claimed = initialSubmission({
  key: operationKey(scope),
  scope,
  targetKey: "target",
  quoteHash: "quote",
  provider: "provider",
  adapterVersion: "adapter",
  providerPriceVersion: "price",
});
const marker = {
  ...claimed,
  status: "unknown_acceptance" as const,
  attemptId: "original",
  version: 1,
};
describe("unfenced recovery candidate is never a native proof", () => {
  it("preserves the historical attempt in a cancelled projection", () => {
    const cancelled = { ...marker, status: "cancelled" as const, cancellationRequested: true };
    expect(submissionRecordSchema.parse(cancelled).attemptId).toBe("original");
    expect(isUnsentLocalProjection(cancelled)).toBe(true);
    expect(
      submissionRecordSchema.safeParse({
        ...cancelled,
        status: "claimed",
        cancellationRequested: false,
      }).success,
    ).toBe(false);
  });
  it.each([
    { settlementRecorded: true },
    { collectedEvidenceId: "observation" },
    { pendingReconciliationReason: "collected_scope_conflict" as const },
    {
      outcome: {
        acceptance: "unknown" as const,
        taskIds: [],
        receivedAt: "2026-10-12T12:00:00.000Z",
        usage: { cached: false, costCents: null, quantity: null, failed: true },
      },
    },
  ])("excludes retained evidence %j before native cancellation", (change) => {
    expect(isUnsentLocalProjection({ ...marker, ...change })).toBe(false);
  });
});
