import { describe, expect, it } from "vitest";
import { explicitQueuedGetCostCents } from "./queued-hosted-results";

describe("queued TaskGET final cost", () => {
  const depth10 = {
    cost: 0,
    status_code: 20000,
    tasks: [{ id: "depth-10-native", status_code: 20000, cost: 0.0024, result: [{ items: [] }] }],
  };
  const depth100 = {
    cost: 0,
    status_code: 20000,
    tasks: [{ id: "depth-100-native", status_code: 20000, cost: 0.024, result: [{ items: [] }] }],
  };

  it("uses the matching native task cost at depths 10 and 100, not envelope zero", () => {
    expect(explicitQueuedGetCostCents(depth10, "depth-10-native")).toBe(0.24);
    expect(explicitQueuedGetCostCents(depth100, "depth-100-native")).toBe(2.4);
  });

  it("keeps missing, negative, and nonfinite matching costs unknown", () => {
    for (const cost of [undefined, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        explicitQueuedGetCostCents(
          { tasks: [{ id: "native", cost, status_code: 20000 }] },
          "native",
        ),
      ).toBeNull();
    }
  });

  it("accepts explicit matching zero and rejects missing or unrelated native IDs", () => {
    expect(
      explicitQueuedGetCostCents(
        { tasks: [{ id: "native", cost: 0, status_code: 20000 }] },
        "native",
      ),
    ).toBe(0);
    expect(() => explicitQueuedGetCostCents(depth100, "depth-10-native")).toThrow(
      /native identity/,
    );
    expect(() => explicitQueuedGetCostCents({ tasks: [] }, "native")).toThrow(/native identity/);
  });

  it("never treats pending or lookup errors as final receipts, regardless of cost", () => {
    for (const status_code of [20100, 40601, 40602, 40401, 40403, 50000]) {
      for (const cost of [0, 0.024]) {
        expect(
          explicitQueuedGetCostCents({ tasks: [{ id: "native", cost, status_code }] }, "native"),
        ).toBeNull();
      }
    }
    expect(
      explicitQueuedGetCostCents(
        { tasks: [{ id: "native", cost: 0.024, status_code: 40501 }] },
        "native",
      ),
    ).toBe(2.4);
  });
});
