import { describe, expect, it } from "vitest";
import {
  type NativePriceBinding,
  type NativePriceSample,
  nativeMeasuredPrice,
} from "./native-price-samples";

const now = new Date("2026-10-11T12:00:00Z");
const binding: NativePriceBinding = {
  namespace: "native",
  principal: "owner",
  projectId: "project",
  connectionId: "connection",
  provider: "dataforseo",
  providerCredentialVersion: "v1",
  fundingSource: "byok",
};
const operation = "serp.google.organic.live.advanced";
const options = { depth: "100", taskCount: "1" };
const rows = (count = 5): NativePriceSample[] =>
  Array.from({ length: count }, (_, index) => ({
    ...binding,
    operation,
    options,
    operationId: `op-${index}`,
    providerRequestId: `request-${index}`,
    origin: "native",
    state: "settled",
    occurredAt: new Date(now.getTime() - index * 1000),
    costCents: "1.5500",
    costCertainty: "measured",
    cached: false,
    failed: false,
    chargeReplayed: false,
  }));
const measure = (samples: NativePriceSample[], policy = binding) =>
  nativeMeasuredPrice(policy, operation, options, samples, now);

describe("native measured call price", () => {
  it("requires five exact native samples and handles reordered option keys", () => {
    expect(measure(rows(4))).toBeUndefined();
    expect(
      measure(rows().map((row) => ({ ...row, options: { taskCount: "1", depth: "100" } }))),
    ).toEqual({
      quantity: { unit: "cents", value: 155n, scale: 2 },
      samples: 5,
      basis: "call",
      checkedAt: now.toISOString(),
    });
  });

  it.each([
    { namespace: "other" },
    { principal: "other" },
    { projectId: "other" },
    { connectionId: "other" },
    { provider: "other" },
    { providerCredentialVersion: "v0" },
    { fundingSource: "platform" },
    { origin: "import" },
    { state: "pending" },
    { costCertainty: "estimated" },
    { cached: true },
    { failed: true },
    { chargeReplayed: true },
    { operation: "serp.google.organic.task_post" },
    { options: { depth: "10", taskCount: "1" } },
    { options: null },
    { options: {} },
    { options: { depth: 100, taskCount: 1 } },
    { occurredAt: new Date(now.getTime() + 1) },
    { occurredAt: new Date(now.getTime() - 30 * 86_400_000 - 1) },
    { costCents: null },
    { costCents: "0.0000" },
    { costCents: "NaN" },
    { costCents: "1e-2" },
    { costCents: "0.00001" },
    { costCents: "-1" },
  ])("does not pool incompatible or unproved rows: %j", (changed) => {
    const samples = rows();
    samples[4] = { ...rows()[4], ...changed } as NativePriceSample;
    expect(measure(samples)).toBeUndefined();
  });

  it("does not turn provider samples into customer prices", () => {
    expect(measure(rows(), { ...binding, fundingSource: "platform" })).toBeUndefined();
  });

  it("deduplicates both retained operations and repeated provider responses", () => {
    expect(measure([...rows(4), { ...rows()[0] }])).toBeUndefined();
    const samples = rows();
    const last = samples[4];
    if (!last) throw new Error("Fixture missing");
    last.providerRequestId = samples[0]?.providerRequestId ?? null;
    expect(measure(samples)).toBeUndefined();
  });

  it("takes the latest fifty independent calls inside the thirty-day window", () => {
    const samples = rows(55).map((row, index) => ({
      ...row,
      costCents: index < 50 ? "1.5500" : "9999",
    }));
    expect(measure(samples)).toMatchObject({ samples: 50, quantity: { value: 155n, scale: 2 } });
    const first = samples[0];
    if (!first) throw new Error("Fixture missing");
    first.occurredAt = new Date(now.getTime() - 30 * 86_400_000);
    expect(measure(samples)?.samples).toBe(50);
  });

  it("retains the exact even median beyond native receipt precision", () => {
    const samples = rows(6).map((row, index) => ({
      ...row,
      costCents: index < 3 ? "0.0001" : "0.0002",
    }));
    expect(measure(samples)?.quantity).toEqual({ unit: "cents", value: 15n, scale: 5 });
  });
});
