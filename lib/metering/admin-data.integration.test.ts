import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import { createMeter } from "@usagekit/meter";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connections: vi.fn(),
  projects: vi.fn(),
  runtime: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.query,
    providerConnection: { findMany: mocks.connections },
    project: { findMany: mocks.projects },
  },
}));
vi.mock("./runtime", () => ({ meteringNamespace: () => "test", meteringRuntime: mocks.runtime }));

import { readMeteringAdmin } from "./admin-data";
import { receiptFromEntry, reserveFromEntry, type UsageEntry } from "./mapping";
import { fundingSpendingBudgets } from "./spending-limits";
import { type Prisma, transactions } from "./store/host-sql";
import { fixture } from "./store/test-fixture";

it("reads canonical admin usage, current budget headroom, and durable exceptions from Postgres", async () => {
  const f = await fixture();
  try {
    f.clock.set("2026-09-23T12:00:00Z");
    const tx = transactions(f.client(), f.schema, f.counters);
    mocks.query.mockImplementation((query: Prisma.Sql) => tx.read((sql) => sql.query(query)));
    mocks.connections.mockResolvedValue([
      {
        id: "c1",
        publicId: "prc_c1",
        provider: "dataforseo",
        projectId: "p1",
        project: { ownerId: "u1" },
      },
    ]);
    mocks.projects.mockResolvedValue([{ id: "p1", publicId: "prj_p1", ownerId: "u1" }]);
    f.budgets.push(
      ...fundingSpendingBudgets(
        "test",
        { id: "c1", provider: "dataforseo", app: "10", programmatic: "10", unit: "cents" },
        "byok",
        1,
      ),
    );
    const meter = createMeter({
      store: f.store,
      clock: f.clock,
      resolveOwnership: async (scope) => ({
        kind: "principal",
        namespace: scope.namespace,
        principal: "u1",
      }),
    });
    mocks.runtime.mockResolvedValue({ meter });
    const grants = new Map<string, { version: number; leaseId: string }>();
    const begin = async (entry: UsageEntry, estimate: { cents: string; units: string }) => {
      const reserved = await meter.reserve(reserveFromEntry("test", entry, estimate));
      if (reserved.outcome !== "reserved") throw new Error(reserved.outcome);
      const grant = await f.store.markDispatchIntent({
        namespace: "test",
        principal: "u1",
        operationId: entry.id,
        expectedVersion: reserved.operation.version,
        commandId: `dispatch:${entry.id}`,
        holder: "test",
        leaseTtlMs: 60000,
      });
      if (!("granted" in grant) || !grant.granted) throw new Error("dispatch denied");
      grants.set(entry.id, { version: grant.operation.version, leaseId: grant.lease.leaseId });
    };
    const record = async (entry: UsageEntry) => {
      const grant = grants.get(entry.id);
      if (!grant) throw new Error("Missing fixture dispatch grant");
      const result = await meter.settle({
        namespace: "test",
        principal: "u1",
        operationId: entry.id,
        expectedVersion: grant.version,
        commandId: `settle:${entry.id}:${entry.measurementStatus}`,
        authority:
          entry.id === "pending" && entry.measurementStatus === "recorded"
            ? { kind: "late_evidence", source: "verified_fixture" }
            : { kind: "lease", leaseId: grant.leaseId },
        receipt: receiptFromEntry(entry, f.clock.now()),
      });
      if (result.outcome !== "settled") throw new Error(result.outcome);
      grants.set(entry.id, { ...grant, version: result.operation.version });
    };
    const entry: UsageEntry = {
      id: "op",
      ownerId: "u1",
      projectId: "p1",
      connectionId: "c1",
      provider: "dataforseo",
      allocationTag: ownAllocationTag("dataforseo", "c1"),
      feature: "rank_check",
      source: "app",
      createdAt: f.clock.now(),
      costCents: "1.0001",
      usageQuantity: "1",
      measurementStatus: "recorded",
      cached: false,
      failed: false,
    };
    await begin(entry, { cents: "1.0001", units: "1" });
    await record(entry);
    await begin({ ...entry, id: "pending" }, { cents: "2", units: "1" });
    await record({
      ...entry,
      id: "pending",
      measurementStatus: "unknown",
      usageQuantity: null,
    });
    const page = await readMeteringAdmin({ month: "2026-09", project: "p1" });
    expect(page.usage.rows).toHaveLength(1);
    // A pending operation makes the aggregate's certainty unknown; it cannot show a false precise delta.
    expect(page.usage.rows[0]).toMatchObject({
      dimensions: { connection: "prc_c1" },
      cost: { certainty: "unknown" },
      certainty: "unknown",
    });
    expect(
      page.budgets.find((b) => b.traffic.kind === "surface" && b.traffic.surface === "app"),
    ).toMatchObject({
      used: { text: "1.0001" },
      remaining: { text: "6.9999" },
    });
    expect(page.exceptions.rows).toEqual([
      expect.objectContaining({ operationId: "pending", state: "pending" }),
    ]);
    await record({ ...entry, id: "pending", costCents: "0.0000", usageQuantity: "0" });
    const settled = await readMeteringAdmin({ month: "2026-09", project: "p1" });
    expect(settled.usage.rows[0]).toMatchObject({
      cost: { text: "1.0001" },
      certainty: "measured",
    });
  } finally {
    await f.close();
  }
});
