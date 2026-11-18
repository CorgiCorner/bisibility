import { setImmediate } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import {
  admitted,
  createBody,
  mocks,
  request,
  runId,
} from "./model-playground-router.test-helpers";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const outcomes = ["admitted", "confirmation_required", "not_dispatched", "500", "503"] as const;
function prepare(outcome: (typeof outcomes)[number]) {
  if (outcome === "500") mocks.service.create.mockRejectedValueOnce(new Error("uncertain"));
  else if (outcome === "503") mocks.service.enabled = false;
  else if (outcome === "not_dispatched")
    mocks.service.create.mockResolvedValueOnce({
      kind: outcome,
      reason: "quote_expired",
      quoteInvalidated: true,
    });
  else if (outcome === "confirmation_required")
    mocks.service.create.mockResolvedValueOnce({
      kind: outcome,
      nonce: runId,
      contentHash: "a".repeat(64),
      attemptIds: ["attempt"],
      earlierAttemptUnconfirmed: true,
    });
  return outcome === "500" ? 500 : outcome === "503" ? 503 : 200;
}
describe("body-bound native create replay", () => {
  it.each(outcomes)(
    "rejects a different body after %s and preserves the original",
    async (outcome) => {
      const status = prepare(outcome);
      const first = await request("POST", "runs", createBody, "K");
      expect(first.status).toBe(status);
      const control = await request("POST", "runs", createBody, "K");
      expect(control.status).toBe(status);
      expect(control.headers.get("Idempotency-Replayed")).toBe("true");
      expect(await control.json()).toEqual(await first.json());
      for (const changed of [
        { ...createBody, quoteId: runId },
        {
          ...createBody,
          confirmUnknown: { nonce: runId, contentHash: "a".repeat(64), attemptIds: ["attempt"] },
        },
      ]) {
        const mismatch = await request("POST", "runs", changed, "K");
        expect(mismatch.status).toBe(422);
        expect(mismatch.headers.get("Idempotency-Replayed")).toBeNull();
        expect((await mismatch.json()).type).toContain("validation_failed");
      }
      expect((await request("POST", "runs", createBody, "K")).status).toBe(status);
      expect(mocks.service.create).toHaveBeenCalledTimes(outcome === "503" ? 0 : 1);
    },
  );
  it("coalesces a concurrent duplicate and refuses a concurrent different body", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = deferred();
    mocks.service.create.mockImplementationOnce(async () => {
      started.resolve();
      await pending;
      return admitted;
    });
    const first = request("POST", "runs", createBody, "K");
    await started.promise;
    const waiters = deferred();
    let claims = 0;
    mocks.redis.getRedisClient.mockImplementation(async () => {
      if (++claims === 2) waiters.resolve();
      return null;
    });
    const same = request("POST", "runs", createBody, "K");
    const different = request("POST", "runs", { ...createBody, quoteId: runId }, "K");
    let settled = false;
    void different.then(() => {
      settled = true;
    });
    await waiters.promise;
    await setImmediate();
    expect(settled).toBe(false);
    expect(mocks.service.create).toHaveBeenCalledOnce();
    release();
    const responses = await Promise.all([first, same, different]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 422]);
    expect(mocks.service.create).toHaveBeenCalledOnce();
  });
  it("denies an unauthorized cached-key request before comparing its body", async () => {
    expect((await request("POST", "runs", createBody, "K")).status).toBe(200);
    const { auth } = await import("./model-playground-router.test-helpers");
    const denied = await request("POST", "runs", { invalid: true }, "K", {
      ...auth,
      apiKey: { ...auth.apiKey, scopes: ["read"] },
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).type).toContain("forbidden");
    expect(mocks.service.create).toHaveBeenCalledOnce();
  });
});
