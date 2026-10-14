import { describe, expect, it, vi } from "vitest";
import type { LocalProviderPorts } from "./contracts";
import { createMapsAdapter, mapsNormalizer } from "./maps-adapter";
import {
  mapsAcceptedEnvelope,
  mapsResultEnvelope,
  nativeIds,
  pricedMapsFixture,
  receiptTime,
} from "./maps-test-fixtures";

async function fixture() {
  const base = await pricedMapsFixture();
  const ports = {
    clock: () => receiptTime,
    assertPreparedBinding: vi.fn(async () => undefined),
    assertPreparedQuote: vi.fn(async () => undefined),
    submitPrepared: vi.fn(async () => ({
      data: mapsAcceptedEnvelope(),
      ok: true,
      dispatchEvidence: base.priced,
    })),
    assertDurableDispatchEvidence: vi.fn(async () => undefined),
    assertRetrieval: vi.fn(async () => undefined),
    retrieveEnvelope: vi.fn(async () => mapsResultEnvelope()),
  } satisfies LocalProviderPorts<typeof base.priced>;
  return {
    ...base,
    ports,
    adapter: createMapsAdapter({
      binding: base.binding,
      capability: base.capability,
      providerPriceVersion: base.record.providerPriceVersion,
      ports,
    }),
  };
}
describe("one original admitted Maps POST and retained collection", () => {
  it("submits real nominal priced bytes once and verifies dispatch before retaining acceptance", async () => {
    const f = await fixture();
    expect(await f.adapter.submit(f.priced)).toMatchObject({
      acceptance: "accepted",
      taskIds: [nativeIds[0]],
      usage: { costCents: 0.06 },
      dispatchEvidenceVerified: true,
    });
    await expect(f.adapter.submit(f.priced)).rejects.toThrow("already attempted");
    expect(f.ports.submitPrepared).toHaveBeenCalledExactlyOnceWith(f.priced);
  });
  it("blocks a concurrent second POST and never retries unknown acceptance", async () => {
    const f = await fixture();
    f.ports.submitPrepared.mockRejectedValue(new Error("synthetic secret"));
    const first = f.adapter.submit(f.priced);
    await expect(f.adapter.submit(f.priced)).rejects.toThrow("already attempted");
    expect(await first).toMatchObject({
      acceptance: "unknown",
      taskIds: [],
      usage: { costCents: null },
    });
    expect(f.ports.submitPrepared).toHaveBeenCalledOnce();
  });
  it("keeps actual cost and accepted ID when durable verification becomes unavailable", async () => {
    const f = await fixture();
    f.ports.assertDurableDispatchEvidence.mockRejectedValue(new Error("synthetic failure"));
    expect(await f.adapter.submit(f.priced)).toMatchObject({
      acceptance: "unknown",
      taskIds: [nativeIds[0]],
      usage: { costCents: 0.06 },
      dispatchEvidenceVerified: false,
    });
  });
  it("collects the exact accepted ID after cancellation without buying or complete coverage claims", async () => {
    const f = await fixture();
    await f.adapter.assertRetrieval(f.record);
    const result = await f.adapter.collect([nativeIds[0]]);
    expect(result).toMatchObject({
      taskIds: [nativeIds[0]],
      completeness: "unknown",
      completeThrough: null,
    });
    expect(f.ports.submitPrepared).not.toHaveBeenCalled();
    expect(f.ports.retrieveEnvelope).toHaveBeenCalledExactlyOnceWith(
      `https://api.dataforseo.com/v3/serp/google/maps/task_get/advanced/${nativeIds[0]}`,
    );
    const normalized = await mapsNormalizer(f.binding).normalize({
      record: f.record,
      result,
      target: f.binding.target,
      point: f.binding.point,
    });
    expect(normalized.requestPolicy.evidence?.targetRevision).toBe(f.record.targetKey);
  });
  it("does not collect a replacement task or bypass current custody", async () => {
    const f = await fixture();
    await f.adapter.assertRetrieval(f.record);
    await expect(f.adapter.collect([nativeIds[1]])).rejects.toThrow("ID changed");
    f.ports.assertRetrieval.mockRejectedValue(new Error("custody revoked"));
    await expect(f.adapter.collect([nativeIds[0]])).rejects.toThrow("custody revoked");
    expect(f.ports.retrieveEnvelope).not.toHaveBeenCalled();
  });
});
