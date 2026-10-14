import { executionFixture } from "@/lib/local-monitoring/execution.test-fixture";
import { submitLocalTarget } from "@/lib/local-monitoring/submit";
import { operationKey } from "@/lib/local-monitoring/target-key";
import { submissionOutcomeSchema } from "@/lib/local-monitoring-store/schema";
import { describe, expect, it } from "vitest";
import { OriginalSubmitProofConflictError, OriginalSubmitProofWriteError } from "./errors";
import { originalReply } from "./host.test-fixture";
import { canonicalLocalSubmitReply, onceOnlyCapturedLocalSubmit } from "./submission-reply";

describe("original submit response bridge without transport I/O", () => {
  it("strips provider diagnostics while preserving exact validated Store fields", () => {
    const reply = originalReply();
    const canonical = canonicalLocalSubmitReply(reply);
    expect(submissionOutcomeSchema.parse(canonical)).toEqual({
      acceptance: reply.acceptance,
      taskIds: reply.taskIds,
      receivedAt: reply.receivedAt,
      usage: reply.usage,
    });
    expect(Object.keys(canonical)).toEqual(["acceptance", "taskIds", "receivedAt", "usage"]);
    expect(JSON.stringify(canonical)).not.toMatch(
      /taskCharges|envelopeCostUsd|dispatchEvidenceVerified/,
    );
  });
  it("cannot infer exhaustive acceptance from an unverified dispatch result", () => {
    expect(
      canonicalLocalSubmitReply({ ...originalReply(), dispatchEvidenceVerified: false }).acceptance,
    ).toBe("unknown");
  });
  it("preserves received native reply for Store fallback if only diagnostic proof write fails", async () => {
    let posts = 0;
    const reply = originalReply();
    const request = Object.freeze({ attemptId: "synthetic-original" });
    const captured = onceOnlyCapturedLocalSubmit({
      assertRequest: () => undefined,
      submit: async () => {
        posts += 1;
        return reply;
      },
      retain: async () => {
        throw new OriginalSubmitProofWriteError();
      },
    });
    expect(await captured.submit(request)).toEqual(canonicalLocalSubmitReply(reply));
    expect(captured.diagnostic()).toBe("store_fallback_required");
    await expect(captured.submit(request)).rejects.toThrow("already attempted");
    expect(posts).toBe(1);
  });
  it("keeps true response loss unknown and never retries the POST", async () => {
    let posts = 0;
    let writes = 0;
    const captured = onceOnlyCapturedLocalSubmit({
      assertRequest: () => undefined,
      submit: async () => {
        posts += 1;
        throw new Error("Synthetic response loss.");
      },
      retain: async () => {
        writes += 1;
      },
    });
    await expect(captured.submit(null)).rejects.toThrow("response loss");
    await expect(captured.submit(null)).rejects.toThrow("already attempted");
    expect(posts).toBe(1);
    expect(writes).toBe(0);
    expect(captured.diagnostic()).toBe("not_received");
  });
  it("does not downgrade custody/body conflict to an infrastructure fallback", async () => {
    let posts = 0;
    const captured = onceOnlyCapturedLocalSubmit({
      assertRequest: () => undefined,
      submit: async () => {
        posts += 1;
        return originalReply();
      },
      retain: async () => {
        throw new OriginalSubmitProofConflictError();
      },
    });
    await expect(captured.submit(null)).rejects.toMatchObject({
      name: "OriginalSubmitProofConflictError",
    });
    await expect(captured.submit(null)).rejects.toThrow("already attempted");
    expect(posts).toBe(1);
  });
  it("keeps the target unknown after both diagnostic proof and Store outcome persistence fail", async () => {
    const f = executionFixture();
    const submit = f.adapter.submit;
    f.store.failEvent = "outcome";
    const captured = onceOnlyCapturedLocalSubmit({
      assertRequest: () => undefined,
      submit: async (request: Parameters<typeof submit>[0]) => ({
        ...(await submit(request)),
        taskCharges: [],
        envelopeCostUsd: null,
        dispatchEvidenceVerified: true,
      }),
      retain: async () => {
        throw new OriginalSubmitProofWriteError();
      },
    });
    f.adapter.submit = captured.submit;
    await expect(submitLocalTarget(f)).rejects.toThrow("persistence");
    expect(await f.store.read(operationKey(f.scope))).toMatchObject({
      status: "unknown_acceptance",
      outcome: null,
    });
    expect((await submitLocalTarget(f)).fresh).toBe(false);
    await expect(
      submitLocalTarget({ ...f, scope: { ...f.scope, idempotencyKey: "fresh-after-both-fail" } }),
    ).rejects.toThrow("reconcile before repurchase");
    expect(f.state.submitCalls).toBe(1);
  });
});
