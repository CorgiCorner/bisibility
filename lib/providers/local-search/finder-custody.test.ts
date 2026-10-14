import { describe, expect, it, vi } from "vitest";
import { createMapsAdapter, mapsNormalizer } from "./maps-adapter";
import { MAPS_V2_ADAPTER_VERSION, mapsTaskRequest } from "./maps-capability";
import { parseMapsResult } from "./maps-result";
import {
  mapsAcceptedEnvelope,
  mapsFixture,
  mapsResultEnvelope,
  nativeIds,
  pricedMapsFixture,
  receiptTime,
} from "./maps-test-fixtures";
import { localBindingFixture } from "./test-fixtures";

async function fixture() {
  const original = localBindingFixture("local_finder");
  const binding = {
    ...original,
    target: { ...original.target, rankScale: "finder_group" as const, language: "pl" },
  };
  const f = await pricedMapsFixture(false, false, binding);
  const expected = JSON.parse(String(mapsTaskRequest(binding).body))[0];
  const payload = {
    status_code: 20000,
    tasks_count: 1,
    cost: 0,
    tasks: [
      {
        id: nativeIds[0],
        status_code: 20000,
        result_count: 1,
        path: ["v3", "serp", "google", "local_finder", "task_get", "advanced", nativeIds[0]],
        data: { ...expected, api: "serp", se: "google", se_type: "local_finder" },
        result: [
          {
            type: "local_finder",
            keyword: binding.keyword.text,
            language_code: "pl",
            datetime: receiptTime.toISOString(),
            spell: null,
            items_count: 3,
            items: [
              {
                type: "local_pack",
                rank_group: 1,
                rank_absolute: 1,
                is_paid: true,
                cid: "9007199254740993123",
              },
              {
                type: "local_pack",
                rank_group: 2,
                rank_absolute: 2,
                is_paid: false,
                cid: "9007199254740993124",
              },
              { type: "local_pack", rank_group: 3, rank_absolute: 3, cid: "9007199254740993125" },
            ],
          },
        ],
      },
    ],
  };
  const ports = {
    clock: () => receiptTime,
    assertPreparedBinding: vi.fn(async () => {}),
    assertPreparedQuote: vi.fn(async () => {}),
    submitPrepared: vi.fn(async () => ({
      ok: true,
      data: mapsAcceptedEnvelope(),
      dispatchEvidence: f.priced,
    })),
    assertDurableDispatchEvidence: vi.fn(async () => {}),
    assertRetrieval: vi.fn(async () => {}),
    retrieveEnvelope: vi.fn(async () => payload),
  };
  return {
    ...f,
    payload,
    ports,
    adapter: createMapsAdapter({
      binding,
      capability: f.capability,
      providerPriceVersion: f.record.providerPriceVersion,
      ports,
    }),
  };
}
describe("Finder custody and independent native evidence", () => {
  it("retains the exact group scale and ad ordinals, then collects after cancellation with no POST", async () => {
    const f = await fixture();
    await f.adapter.assertRetrieval({ ...f.record, cancellationRequested: true });
    const result = await f.adapter.collect([nativeIds[0]]);
    expect(f.ports.submitPrepared).not.toHaveBeenCalled();
    expect(f.ports.retrieveEnvelope).toHaveBeenCalledExactlyOnceWith(
      `https://api.dataforseo.com/v3/serp/google/local_finder/task_get/advanced/${nativeIds[0]}`,
    );
    const run = await mapsNormalizer(f.binding).normalize({
      record: f.record,
      result,
      target: f.binding.target,
      point: f.binding.point,
    });
    expect(run).toMatchObject({
      surface: "local_finder",
      completeness: "unknown",
      effectiveScope: { language: "pl", scopeClass: "coordinate_seed" },
      requestPolicy: { evidence: { completeThrough: { listing: null } } },
    });
    expect(run.items.map((row) => [row.rankGroup, row.rankScale, row.promotion])).toEqual([
      [1, "finder_group", "promoted"],
      [2, "finder_group", "organic"],
      [3, "finder_group", "unknown"],
    ]);
  });
  it("blocks foreign task/surface/coordinates and revoked retrieval before provider I/O", async () => {
    const f = await fixture();
    await f.adapter.assertRetrieval(f.record);
    await expect(f.adapter.collect([nativeIds[1]])).rejects.toThrow();
    f.ports.assertRetrieval.mockRejectedValueOnce(new Error("revoked"));
    await expect(f.adapter.collect([nativeIds[0]])).rejects.toThrow("revoked");
    expect(f.ports.retrieveEnvelope).not.toHaveBeenCalled();
    f.payload.tasks[0].path[3] = "maps";
    expect(() => parseMapsResult(f.payload, nativeIds[0], f.binding, receiptTime)).toThrow();
  });
  it("does not rebuy an uncertain or partially retained acceptance", async () => {
    const f = await fixture();
    f.ports.assertDurableDispatchEvidence.mockRejectedValueOnce(new Error("uncertain"));
    expect(await f.adapter.submit(f.priced)).toMatchObject({
      acceptance: "unknown",
      taskIds: [nativeIds[0]],
      usage: { costCents: 0.06 },
      dispatchEvidenceVerified: false,
    });
    await expect(f.adapter.submit(f.priced)).rejects.toThrow("already attempted");
    expect(f.ports.submitPrepared).toHaveBeenCalledOnce();
  });
  it("keeps legacy Maps v2 geography and capability provenance unchanged", () => {
    const run = parseMapsResult(
      mapsResultEnvelope(),
      nativeIds[0],
      mapsFixture().binding,
      receiptTime,
      MAPS_V2_ADAPTER_VERSION,
    );
    expect(run.effectiveScope).toEqual(run.configuredScope);
    expect(run.requestPolicy.capabilityVersion).toBe(
      "dataforseo-maps-en-v2:maps-standard-100-20261012-v1",
    );
  });
});
