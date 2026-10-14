import type { PricedRequest, ProviderRequest } from "@usagekit/providers";
import { describe, expect, it, vi } from "vitest";
import { createDataForSeoLocalAdapter } from "./adapter";
import type { LocalProviderPorts } from "./contracts";
import { buildLocalTaskRequest } from "./request";
import {
  acceptedTaskEnvelope,
  localBindingFixture,
  nativeIds,
  quoteFixture,
  receiptTime,
  resultEnvelope,
  settledRecord,
} from "./test-fixtures";

function fixture() {
  const binding = localBindingFixture();
  const trace: string[] = [];
  // Opaque mocked port input only: not a nominal pricing/admission acceptance test.
  const requestToken = {} as PricedRequest;
  const dispatchEvidence = Object.freeze({ syntheticEventId: "synthetic-durable-event" });
  const ports = {
    clock: () => receiptTime,
    assertPreparedBinding: vi.fn(async (request: PricedRequest, expected: ProviderRequest) => {
      expect(request).toBe(requestToken);
      expect(expected).toEqual(buildLocalTaskRequest(binding));
      trace.push("binding");
    }),
    assertPreparedQuote: vi.fn(async () => undefined),
    submitPrepared: vi.fn(async () => {
      trace.push("post-once");
      return { data: acceptedTaskEnvelope(), ok: true, dispatchEvidence };
    }),
    assertDurableDispatchEvidence: vi.fn(async (evidence: typeof dispatchEvidence) => {
      expect(evidence).toBe(dispatchEvidence);
      trace.push("verify-durable-evidence");
    }),
    assertRetrieval: vi.fn(async () => {
      trace.push("current-own-retrieval");
    }),
    retrieveEnvelope: vi.fn(async (url: string) => {
      trace.push("get-accepted");
      expect(url).toContain(`/maps/task_get/advanced/${nativeIds[0]}`);
      return resultEnvelope();
    }),
  } satisfies LocalProviderPorts<typeof dispatchEvidence>;
  return {
    adapter: createDataForSeoLocalAdapter({
      binding,
      providerPriceVersion: "synthetic-price-v1",
      ports,
    }),
    binding,
    ports,
    trace,
    requestToken,
  };
}

describe("one-shot prepared local adapter with injected existing ports", () => {
  it("delegates prepared transport exactly once and verifies its durable evidence without another admission/settlement", async () => {
    const f = fixture();
    const outcome = await f.adapter.submit(f.requestToken);
    expect(outcome).toMatchObject({
      acceptance: "accepted",
      taskIds: [nativeIds[0]],
      dispatchEvidenceVerified: true,
    });
    expect(f.trace).toEqual(["binding", "post-once", "verify-durable-evidence"]);
    expect(f.ports.submitPrepared).toHaveBeenCalledExactlyOnceWith(f.requestToken);
    await expect(f.adapter.submit(f.requestToken)).rejects.toThrow("already attempted");
    expect(f.ports.submitPrepared).toHaveBeenCalledOnce();
  });

  it("does not retry a timeout/lost response, and retains an unknown receipt without secret exception text", async () => {
    const f = fixture();
    f.ports.submitPrepared.mockRejectedValue(new Error("synthetic-private-transport-secret"));
    const outcome = await f.adapter.submit(f.requestToken);
    expect(outcome).toMatchObject({
      acceptance: "unknown",
      taskIds: [],
      usage: { costCents: null, quantity: null, failed: true },
    });
    expect(JSON.stringify(outcome)).not.toContain("synthetic-private-transport-secret");
    await expect(f.adapter.submit(f.requestToken)).rejects.toThrow("reconcile before retrying");
    expect(f.ports.submitPrepared).toHaveBeenCalledOnce();
  });

  it("fences concurrent callers before awaited binding checks, allowing one injected dispatch only", async () => {
    const f = fixture();
    const gate: { release?: () => void } = {};
    f.ports.assertPreparedBinding.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          gate.release = resolve;
        }),
    );
    const first = f.adapter.submit(f.requestToken);
    await expect(f.adapter.submit(f.requestToken)).rejects.toThrow("already attempted");
    expect(f.ports.submitPrepared).not.toHaveBeenCalled();
    gate.release?.();
    await first;
    expect(f.ports.submitPrepared).toHaveBeenCalledOnce();
  });

  it("keeps received accepted IDs and charges if durable verification fails after the response", async () => {
    const f = fixture();
    f.ports.assertDurableDispatchEvidence.mockRejectedValue(
      new Error("synthetic-private-journal-secret"),
    );
    const outcome = await f.adapter.submit(f.requestToken);
    expect(outcome).toMatchObject({
      acceptance: "unknown",
      taskIds: [nativeIds[0]],
      usage: { costCents: 1.2 },
      dispatchEvidenceVerified: false,
    });
    expect(JSON.stringify(outcome)).not.toContain("synthetic-private-journal-secret");
    expect(f.ports.submitPrepared).toHaveBeenCalledOnce();
  });

  it("retrieves accepted settled tasks after cancellation via current custody check before every GET, never another POST", async () => {
    const f = fixture();
    const record = settledRecord(f.binding);
    await f.adapter.assertRetrieval(record);
    f.trace.length = 0;
    const result = await f.adapter.collect(record.outcome?.taskIds ?? []);
    expect(f.trace).toEqual(["current-own-retrieval", "get-accepted"]);
    expect(result).toMatchObject({
      taskIds: [nativeIds[0]],
      observedAt: "2026-10-11T11:58:00.000Z",
      completeness: "unknown",
      completeThrough: null,
    });
    expect(f.ports.submitPrepared).not.toHaveBeenCalled();
    expect(f.ports.assertPreparedQuote).not.toHaveBeenCalled();
  });

  it("fails closed for direct collection, unsettled IDs, changed custody, or a different requested UUID", async () => {
    const f = fixture();
    await expect(f.adapter.collect([nativeIds[0]])).rejects.toThrow("authorization");
    await expect(
      f.adapter.assertRetrieval({ ...settledRecord(f.binding), settlementRecorded: false }),
    ).rejects.toThrow("custody");
    await f.adapter.assertRetrieval(settledRecord(f.binding));
    await expect(f.adapter.collect([nativeIds[1]])).rejects.toThrow("authorization");
    f.ports.assertRetrieval.mockRejectedValue(new Error("Synthetic custody revoked"));
    await expect(f.adapter.collect([nativeIds[0]])).rejects.toThrow("custody revoked");
    expect(f.ports.retrieveEnvelope).not.toHaveBeenCalled();
    expect(f.ports.submitPrepared).not.toHaveBeenCalled();
  });

  it("does not activate capabilities or accept changed immutable binding", () => {
    const f = fixture();
    expect(f.adapter.capability.implementations).toEqual([]);
    expect(() =>
      f.adapter.buildRequest({
        target: { ...f.binding.target, cutoff: 10 },
        point: f.binding.point,
        quote: quoteFixture(f.binding),
      }),
    ).toThrow("binding changed");
  });
});
