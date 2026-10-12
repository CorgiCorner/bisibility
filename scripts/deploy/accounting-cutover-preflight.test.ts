import { expect, test, vi } from "vitest";
import { assertAccountingCutoverNamespace } from "./accounting-cutover-preflight";

test("refuses a retained namespace mismatch before any schema operation", async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ present: true }] }).mockResolvedValueOnce({ rows: [{ present: true }] }).mockResolvedValueOnce({ rows: [{ id: 1 }] });
  await expect(assertAccountingCutoverNamespace({ query }, "current")).rejects.toThrow("before schema migration");
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("namespace <> $1"), ["current"]);
});
test("accepts an empty database without querying absent accounting tables", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ present: false }] });
  await expect(assertAccountingCutoverNamespace({ query }, "current")).resolves.toBeUndefined();
  expect(query).toHaveBeenCalledTimes(1);
});

test("retired accounting permits later deploys with historical foreign namespaces", async () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("provider_cost_entries")) return { rows: [{ present: false }] };
    if (sql.includes("to_regclass")) return { rows: [{ present: true }] };
    return { rows: [{ namespace: "retained" }] };
  });
  await expect(assertAccountingCutoverNamespace({ query }, "current")).resolves.toBeUndefined();
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0]?.[0]).toContain("provider_cost_entries");
});

test("pending cutover still rejects unreconciled canonical operations", async () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("to_regclass")) return { rows: [{ present: true }] };
    return { rows: sql.includes("JOIN provider_cost_entries") ? [{ id: 1 }] : [] };
  });
  await expect(assertAccountingCutoverNamespace({ query }, "current")).rejects.toThrow("requires reconciliation");
});
