import {
  binding,
  present,
  pricedBinding,
  reportedResult,
} from "@/lib/model-playground/usage.test-support";
import {
  bindModelUsageEvidence,
  loadModelUsageEvidence,
  persistModelUsageEvidence,
} from "@/lib/model-playground/usage-storage";
import { usageStorageHarness } from "@/lib/model-playground/usage-storage.test-support";
import { describe, expect, it } from "vitest";
import { modelUsageMeterReceipt } from "./model-usage";

const f = usageStorageHarness();
async function retain(id = "attempt-1") {
  if (id !== "attempt-1") await f.seed(id);
  await f.transaction(async (tx) => {
    await bindModelUsageEvidence(tx, id, { ...pricedBinding(), attemptId: id });
    await persistModelUsageEvidence(tx, id, reportedResult("0.000123"));
  });
  return present(await loadModelUsageEvidence(f.tx, id, binding().projectId));
}

describe("native mapping review corrections", () => {
  it("C1 excludes all estimated measurements from a priced confirmed receipt", async () => {
    const mapped = modelUsageMeterReceipt(await retain(), new Date());
    expect(mapped.cost.certainty).toBe("measured");
    expect(
      mapped.measurements.some((m) => m.certainty === "estimated" || m.unit === "budget_cents"),
    ).toBe(false);
  });
  it("C2 refuses a counted-false loaded duplicate even if its canonical pointer is lost", async () => {
    await retain();
    const duplicate = await retain("attempt-2");
    expect(duplicate.counted).toBe(false);
    expect(() => modelUsageMeterReceipt({ ...duplicate, canonicalId: null }, new Date())).toThrow(
      "Duplicate native request cannot settle again.",
    );
  });
  it("C2 uses connection and native request identity even if counted status is accidentally reconstructed", async () => {
    const first = await retain();
    const duplicate = await retain("attempt-2");
    const mapped = modelUsageMeterReceipt(first, new Date());
    const reconstructed = modelUsageMeterReceipt(
      { ...duplicate, counted: true, canonicalId: null },
      new Date(),
    );
    expect(reconstructed.id).toBe(mapped.id);
  });
  it("keeps native request identities isolated between connections", async () => {
    const first = await retain();
    const b = { ...pricedBinding(), attemptId: "attempt-2", connectionId: "other-connection" };
    await f.seed(b.attemptId, { connectionId: b.connectionId });
    await f.transaction(async (tx) => {
      await bindModelUsageEvidence(tx, b.attemptId, b);
      await persistModelUsageEvidence(tx, b.attemptId, reportedResult("0.000123"));
    });
    const second = present(await loadModelUsageEvidence(f.tx, b.attemptId, b.projectId));
    expect(second.counted).toBe(true);
    expect(modelUsageMeterReceipt(first, new Date()).id).not.toBe(
      modelUsageMeterReceipt(second, new Date()).id,
    );
  });
  it("refuses unbound evidence with its own binding message", async () => {
    const loaded = present(await loadModelUsageEvidence(f.tx, "attempt-1", binding().projectId));
    expect(() => modelUsageMeterReceipt(loaded, new Date())).toThrow(
      "Native usage binding is unavailable.",
    );
  });
  it.each(["provider", "upstream"])("refuses retained %s monetary conflicts", async (kind) => {
    const response = reportedResult("0.0001");
    if (kind === "provider") response.providerCost = { ...response.providerCost, amount: "0.0002" };
    else
      response.costEvidence.upstreamInference = {
        total: { ...response.providerCost, amount: "0.0002" },
        input: null,
        output: null,
      };
    await f.transaction(async (tx) => {
      await bindModelUsageEvidence(tx, "attempt-1", binding());
      await persistModelUsageEvidence(tx, "attempt-1", response);
    });
    const loaded = present(await loadModelUsageEvidence(f.tx, "attempt-1", binding().projectId));
    expect(loaded.receipt?.evidence?.costEvidence).toEqual(response.costEvidence);
    expect(() => modelUsageMeterReceipt(loaded, new Date())).toThrow(
      "Meter companion required for native usage settlement independent of money.",
    );
  });
});
