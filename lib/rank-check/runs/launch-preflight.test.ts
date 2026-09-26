import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { estimateRunRows } from "./launch-preflight";

describe("estimateRunRows", () => {
  it("ignores a tiny own manual override when the connection is hosted", () => {
    const depth = 10;
    const expected = estimatedRankCheckCostCents(
      "dataforseo",
      depth,
      null,
      LIST_PROVIDER_RATE_CONTEXT,
    );
    const rows = [{ id: "keyword_1" }] as Parameters<typeof estimateRunRows>[0];
    const connection = {
      costPerCheckCents: 0.0001,
      credentialSource: "hosted",
      id: "connection_1",
      provider: "dataforseo",
      rateContext: { entries: [], manualAmountCents: 0.0001 },
    } as Parameters<typeof estimateRunRows>[3];
    const result = estimateRunRows(rows, depth, {}, connection);
    expect(expected).toBeGreaterThan(0.0001);
    expect(result.targets[0].cost).toBe(expected);
    expect(result.native.quantity).toBe(expected);
  });
});
