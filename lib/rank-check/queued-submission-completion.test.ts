import { beforeEach, expect, it, vi } from "vitest";
import { completeOwnedQueuedSubmission } from "./queued-submission-completion";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(async () => []),
  acknowledge: vi.fn(async () => {}),
}));
vi.mock("@/lib/provider-evidence/recovery/queued-completion", () => ({
  queuedSubmissionSnapshot: mocks.snapshot,
  acknowledgeOriginalQueuedSubmission: mocks.acknowledge,
}));
beforeEach(() => vi.clearAllMocks());
it("write gate: a retry whose snapshot predates the original identity cannot acknowledge the winning submission", async () => {
  let release = () => {};
  const inFlight = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = completeOwnedQueuedSubmission("batch", async (ownClaim) => {
    ownClaim();
    await inFlight;
    return "ambiguous";
  });
  // Both snapshots are empty. Only the original invocation actually owns the DB claim.
  await completeOwnedQueuedSubmission("batch", async () => "ambiguous");
  expect(mocks.snapshot).toHaveBeenCalledTimes(2);
  expect(mocks.acknowledge).not.toHaveBeenCalled();
  release();
  await original;
  expect(mocks.acknowledge).toHaveBeenCalledTimes(1);
});
it("write gate: the winning invocation acknowledges its failed or cancelled final stack", async () => {
  await expect(
    completeOwnedQueuedSubmission("batch", async (ownClaim) => {
      ownClaim();
      throw new Error("cancelled");
    }),
  ).rejects.toThrow("cancelled");
  expect(mocks.acknowledge).toHaveBeenCalledTimes(1);
});
