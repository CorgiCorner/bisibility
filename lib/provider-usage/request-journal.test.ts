import { testOwnAdmission } from "@/lib/provider-usage/byok-test-evidence";
import { byokTestJournal } from "@/lib/provider-usage/byok-test-journal";
import { requestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import type { ProviderRequestAttribution, ProviderRequestSource } from "@/lib/provider-usage/tag";
import { ProviderUsagePersistenceError, readObservedResponse } from "@/lib/providers/usage";
import { describe, expect, it, vi } from "vitest";
import { createProviderRequestJournal } from "./request-journal";

type LedgerRow = Record<string, unknown> & { id: string };

function createFakeLedger(seed: LedgerRow[] = []) {
  return byokTestJournal("serpapi", seed);
}

function attribution(source: ProviderRequestSource = "app"): ProviderRequestAttribution {
  return {
    context: {
      correlationId: "corr-1",
      feature: "rank_check",
      projectId: "project_1",
      source,
      trigger: "manual",
    },
    tag: "app=bisibility;stage=dev;src=app;trg=manual;f=rank_check;p=project_1;c=corr-1",
  };
}

function journal(
  ledger: ReturnType<typeof createFakeLedger>,
  unit: "cents" | "units" = "units",
  source: ProviderRequestSource = "app",
) {
  return createProviderRequestJournal(ledger.db, {
    attribution: attribution(source),
    connectionId: "connection_1",
    projectId: "project_1",
    provider: "serpapi",
    unit,
  });
}

const successReceipt = {
  cached: false,
  costCents: 0,
  failed: false,
  providerRequestId: "search-1",
  quantity: 1,
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("createProviderRequestJournal", () => {
  it.each([undefined, "P2002"])(
    "blocks a different journal sharing consent after settlement fails (%s)",
    async (code) => {
      const ledger = createFakeLedger();
      const costLimit = requestCostLimit(5);
      const sharedJournal = (correlationId: string) =>
        createProviderRequestJournal(ledger.db, {
          attribution: {
            ...attribution(),
            context: { ...attribution().context, correlationId },
          },
          connectionId: "connection_1",
          projectId: "project_1",
          provider: "serpapi",
          unit: "units",
          estimate: { cents: "2", units: "1" },
          costLimit,
        });
      const first = sharedJournal("first");
      const id = await first.observer.begin();
      ledger.table.update.mockRejectedValue(Object.assign(new Error("unavailable"), { code }));
      await expect(first.observer.settle(id, successReceipt)).rejects.toBeInstanceOf(
        ProviderUsagePersistenceError,
      );
      expect(() => costLimit.remaining()).toThrow("unconfirmed");
      await expect(sharedJournal("second").observer.begin()).rejects.toBeInstanceOf(
        ProviderUsagePersistenceError,
      );
      expect(ledger.rows).toHaveLength(1);
    },
  );

  it("preserves the original pending consent when an attempt-key replay fails", async () => {
    const ledger = createFakeLedger();
    const costLimit = requestCostLimit(3);
    const usage = createProviderRequestJournal(ledger.db, {
      attribution: attribution(),
      connectionId: "connection_1",
      projectId: "project_1",
      provider: "serpapi",
      unit: "units",
      estimate: { cents: "2", units: "1" },
      costLimit,
    });
    await usage.observer.begin({ attemptKey: "stable" });
    expect(costLimit.remaining()).toBe("1");
    testOwnAdmission.reserve.mockRejectedValueOnce(new Error("replay failed"));
    await expect(usage.observer.begin({ attemptKey: "stable" })).rejects.toBeInstanceOf(
      ProviderUsagePersistenceError,
    );
    expect(costLimit.remaining()).toBe("1");
  });

  it("settling the same attempt twice does not double its totals", async () => {
    const ledger = createFakeLedger();
    const usage = journal(ledger);
    const id = await usage.observer.begin();
    await usage.observer.settle(id, successReceipt);
    await usage.observer.settle(id, successReceipt);
    expect(usage.quantity).toBe(1);
    expect(ledger.rows).toHaveLength(1);
  });

  it("a confirmed receipt resolves an older unknown native request without a second charge", async () => {
    const ledger = createFakeLedger([
      {
        id: "older",
        connectionId: "connection_1",
        correlationId: "other",
        providerRequestId: "search-1",
        measurementStatus: "unknown",
        costCents: 0,
      },
    ]);
    const usage = journal(ledger);
    await usage.observer.settle(await usage.observer.begin(), successReceipt);
    expect(ledger.rows).toEqual([
      expect.objectContaining({ id: "older", measurementStatus: "recorded", usageQuantity: 1 }),
      expect.objectContaining({ canonicalId: "older", usageQuantity: 0 }),
    ]);
  });

  it("network uncertainty blocks automatic paid retry and retains an unknown receipt", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);
    const request = vi.fn().mockRejectedValue(new DOMException("timed out", "AbortError"));
    await expect(
      readObservedResponse({ observer, request, measure: () => successReceipt }),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(request).toHaveBeenCalledTimes(1);
    expect(ledger.rows).toEqual([
      expect.objectContaining({ measurementStatus: "unknown", usageQuantity: null }),
    ]);
  });

  it("a successful HTTP response without a billing receipt cannot be returned as free usage", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);
    await expect(
      readObservedResponse({
        observer,
        request: async () => jsonResponse({}),
        measure: () => ({ ...successReceipt, quantity: null }),
      }),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(ledger.rows[0].measurementStatus).toBe("unknown");
  });

  it("permits concurrent feature requests but stops replay after an ambiguous request", async () => {
    const ledger = createFakeLedger();
    const usage = journal(ledger);
    const [first, second] = await Promise.all([usage.observer.begin(), usage.observer.begin()]);
    expect(ledger.rows).toHaveLength(2);
    await usage.observer.settle(first, successReceipt);
    await usage.observer.settle(second, {
      cached: false,
      costCents: null,
      failed: true,
      quantity: null,
    });
    expect(usage.quantity).toBeNull();
    await expect(usage.observer.begin()).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(ledger.rows).toHaveLength(2);
  });

  it("summarizes only newly charged request identities", async () => {
    const ledger = createFakeLedger();
    const usage = journal(ledger);
    await usage.observer.settle(await usage.observer.begin(), successReceipt);
    await usage.observer.settle(await usage.observer.begin(), successReceipt);
    expect(usage.quantity).toBe(1);
    expect(usage.costCents).toBe(0);
  });

  it("settle turns the durable unknown row into a recorded receipt", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);

    const id = await observer.begin();
    expect(ledger.rows).toEqual([
      expect.objectContaining({
        costCents: 0,
        failed: false,
        id,
        measurementStatus: "unknown",
        provider: "serpapi",
        source: "app",
      }),
    ]);
    await observer.settle(id, { ...successReceipt, providerRequestId: "search-1" });
    expect(ledger.rows).toEqual([
      expect.objectContaining({
        measurementStatus: "recorded",
        providerRequestId: "search-1",
        usageQuantity: 1,
      }),
    ]);
  });

  it("records a cached zero receipt distinctly, without a provider request id", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);

    const id = await observer.begin();
    await observer.settle(id, {
      cached: true,
      costCents: 0,
      failed: false,
      providerRequestId: "cached-search-1",
      quantity: 0,
    });

    expect(ledger.rows).toEqual([
      expect.objectContaining({
        cached: true,
        measurementStatus: "recorded",
        providerRequestId: undefined,
        usageQuantity: 0,
      }),
    ]);
  });

  it("does not double-count a duplicate provider request id and keeps the original receipt", async () => {
    const ledger = createFakeLedger([
      {
        id: "existing",
        connectionId: "connection_1",
        costCents: 0,
        failed: false,
        measurementStatus: "recorded",
        providerRequestId: "search-1",
        usageQuantity: 1,
      },
    ]);
    const { observer } = journal(ledger);

    const id = await observer.begin();
    await observer.settle(id, { ...successReceipt });

    // The new attempt row is withdrawn; the earlier recorded receipt survives.
    expect(ledger.rows.map((row) => row.id)).toEqual(["existing", id]);
    expect(ledger.rows[0]).toMatchObject({ measurementStatus: "recorded", usageQuantity: 1 });
    expect(ledger.rows[1]).toMatchObject({ canonicalId: "existing", usageQuantity: 0 });
  });

  it("retains a charge on settlement after a P2002 once the retry settles", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);
    const id = await observer.begin();
    ledger.table.update.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed."), { code: "P2002" }),
    );

    await observer.settle(id, { ...successReceipt });

    expect(ledger.rows).toEqual([
      expect.objectContaining({ measurementStatus: "recorded", usageQuantity: 1 }),
    ]);
  });

  it("keeps the durable unknown row when settlement fails permanently", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);
    const id = await observer.begin();
    ledger.table.update.mockRejectedValue(new Error("ledger unavailable"));

    await expect(observer.settle(id, { ...successReceipt })).rejects.toBeInstanceOf(
      ProviderUsagePersistenceError,
    );
    expect(ledger.rows).toEqual([
      expect.objectContaining({ costCents: 0, measurementStatus: "unknown" }),
    ]);

    // The durable unknown row blocks a new paid attempt under the same correlation.
    await expect(observer.begin()).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
  });

  it("keeps the durable unknown row when a P2002 retry also fails", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);
    const id = await observer.begin();
    ledger.table.update.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed."), { code: "P2002" }),
    );

    await expect(observer.settle(id, { ...successReceipt })).rejects.toBeInstanceOf(
      ProviderUsagePersistenceError,
    );
    expect(ledger.table.update).toHaveBeenCalledTimes(2);
    expect(ledger.rows).toEqual([expect.objectContaining({ measurementStatus: "unknown" })]);
  });

  it("rejects negative receipt values without losing the unknown row", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);
    const id = await observer.begin();

    await expect(
      observer.settle(id, { cached: false, costCents: -1, failed: false, quantity: -1 }),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(ledger.rows).toEqual([
      expect.objectContaining({ costCents: 0, measurementStatus: "unknown" }),
    ]);
  });

  it("records unknown, not zero, when the settled quantity is null", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);
    const id = await observer.begin();

    await observer.settle(id, {
      cached: false,
      costCents: null,
      failed: false,
      quantity: null,
    });

    expect(ledger.rows).toEqual([
      expect.objectContaining({
        costCents: 0,
        measurementStatus: "unknown",
        usageQuantity: null,
      }),
    ]);
  });

  it("measures cents journals by cost and units journals by quantity", async () => {
    const centsLedger = createFakeLedger();
    const centsJournal = journal(centsLedger, "cents");
    const centsId = await centsJournal.observer.begin();
    await centsJournal.observer.settle(centsId, {
      cached: false,
      costCents: 3,
      failed: false,
      quantity: 7,
    });
    // A cents journal trusts the reported cost; a null cost stays unknown.
    expect(centsLedger.rows).toEqual([
      expect.objectContaining({ measurementStatus: "recorded", usageQuantity: 7 }),
    ]);

    const nullCostLedger = createFakeLedger();
    const nullCostJournal = journal(nullCostLedger, "cents");
    const nullCostId = await nullCostJournal.observer.begin();
    await nullCostJournal.observer.settle(nullCostId, {
      cached: false,
      costCents: null,
      failed: false,
      quantity: 7,
    });
    expect(nullCostLedger.rows).toEqual([
      expect.objectContaining({ measurementStatus: "unknown" }),
    ]);
  });

  it("preserves each request source attribution on the journal row", async () => {
    const sources: ProviderRequestSource[] = ["app", "worker", "api", "mcp", "sdk", "cli"];
    for (const source of sources) {
      const ledger = createFakeLedger();
      const { observer } = journal(ledger, "units", source);
      const id = await observer.begin();
      await observer.settle(id, { ...successReceipt, providerRequestId: `search-${source}` });
      expect(ledger.rows).toEqual([expect.objectContaining({ source })]);
    }
  });

  it("propagates a begin persistence failure without allowing an HTTP request", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);
    ledger.table.createMany.mockRejectedValue(new Error("ledger unavailable"));
    const request = vi.fn();

    await expect(
      readObservedResponse({ observer, request, measure: () => ({ ...successReceipt }) }),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(request).not.toHaveBeenCalled();
  });

  it("a settlement failure surfaces the durable unknown row and makes no second request", async () => {
    const ledger = createFakeLedger();
    const { observer } = journal(ledger);
    ledger.table.update.mockRejectedValue(new Error("ledger unavailable"));
    const request = vi
      .fn()
      .mockResolvedValue(jsonResponse({ search_metadata: { status: "Success" } }));

    await expect(
      readObservedResponse({
        observer,
        request,
        measure: () => ({ ...successReceipt }),
      }),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(request).toHaveBeenCalledTimes(1);
    expect(ledger.rows).toEqual([
      expect.objectContaining({ costCents: 0, measurementStatus: "unknown" }),
    ]);
  });
});

vi.mock("@/lib/provider-usage/admission-extension", async () => ({
  ownAdmission: (await import("@/lib/provider-usage/byok-test-evidence")).testOwnAdmission,
}));
