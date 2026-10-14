import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { reconcileProviderUsage } from "./reconcile";

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notify }));
const now = new Date("2026-10-10T12:00:00Z");
function fixture(
  health = { unconfirmed: 2n, overdue: 1n, oldest: new Date("2026-10-10T11:44:00Z") },
) {
  const queries: string[] = [];
  const tx = {
    $queryRawUnsafe: vi.fn(async (text: string) => {
      if (text.includes("FROM pg_trigger"))
        return [
          {
            tables: [
              "metering_event",
              "metering_history_progress",
              "metering_import",
              "metering_operation",
              "metering_paid_attempt_context",
              "metering_receipt",
            ],
          },
        ];
      if (text.includes("SELECT value FROM metering_metadata"))
        return [{ value: "utc-core-v2-fence-presence-v1" }];
      throw new Error(`Unexpected timestamp guard query: ${text}`);
    }),
    $executeRawUnsafe: async () => {
      throw new Error("Verify-only reconciliation attempted adoption");
    },
    $queryRaw: vi.fn(async (query: { sql: string }) => {
      queries.push(query.sql);
      if (query.sql.includes("provider_cost_entries")) throw new Error("legacy ledger accessed");
      if (query.sql.includes("AS unconfirmed")) return [health];
      if (query.sql.includes("value AS cursor")) return [{ cursor: "", cutoff: now }];
      return [];
    }),
    $executeRaw: vi.fn(async () => 1),
    instanceSetting: { upsert: vi.fn() },
  };
  const client = {
    ...tx,
    $transaction: vi.fn(async (work: (tx: unknown) => unknown) => work(tx)),
    get providerCostEntry() {
      throw new Error("legacy ledger accessed");
    },
  };
  return { client, tx, queries };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
it("counts unknown and overdue operations from Store with no legacy ledger reads", async () => {
  const f = fixture();
  await expect(reconcileProviderUsage(f.client as never)).resolves.toMatchObject({
    hasMore: false,
    scanned: 0,
    reconciled: 0,
    unconfirmed: 2,
    overdue: 1,
    lastReconciledAt: now.toISOString(),
  });
  expect(f.queries.join(" ")).toContain("metering_operation");
  expect(mocks.notify).toHaveBeenCalledWith(
    expect.objectContaining({
      fields: expect.objectContaining({
        "Oldest age minutes": 16,
        "Overdue entries": 1,
        "Unconfirmed total": 2,
      }),
    }),
  );
});
it("does not stamp a successful watermark when accounting recovery fails", async () => {
  const f = fixture();
  f.tx.$queryRaw.mockRejectedValue(new Error("Store unavailable"));
  await expect(reconcileProviderUsage(f.client as never)).rejects.toThrow("Store unavailable");
  expect(f.tx.instanceSetting.upsert).not.toHaveBeenCalled();
});

it("refuses unadopted accounting without writing recovery progress or a successful watermark", async () => {
  const f = fixture();
  const original = f.tx.$queryRawUnsafe.getMockImplementation();
  f.tx.$queryRawUnsafe.mockImplementation(async (text: string) =>
    text.includes("SELECT value FROM metering_metadata") ? [] : (original?.(text) ?? []),
  );
  await expect(reconcileProviderUsage(f.client as never)).rejects.toThrow(
    "requires prior UTC write adoption",
  );
  expect(f.tx.instanceSetting.upsert).not.toHaveBeenCalled();
  expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
});

afterEach(() => vi.useRealTimers());

it("retains the default bounded page for an explicit zero limit", async () => {
  const f = fixture();
  await reconcileProviderUsage(f.client as never, { limit: 0 });
  const candidate = f.tx.$queryRaw.mock.calls.find(([query]) =>
    query.sql.includes("candidates WHERE"),
  );
  expect(candidate?.[0]).toMatchObject({ values: expect.arrayContaining([101]) });
});
