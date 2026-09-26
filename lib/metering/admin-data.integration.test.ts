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
import { allocationBudgets, type UsageEntry } from "./mapping";
import { createShadowEngine } from "./shadow-engine";
import { createPostgresShadowHandoffs } from "./shadow-handoff";
import { Prisma, transactions } from "./store/sql";
import { fixture } from "./store/test-fixture";

it("reads exact admin differences, current budget headroom, and durable exceptions from Postgres", async () => {
  const f = await fixture();
  try {
    f.clock.set("2026-09-23T12:00:00Z");
    const tx = transactions(f.client(), f.schema, f.counters);
    mocks.query.mockImplementation((query: Prisma.Sql) => tx.read((sql) => sql.query(query)));
    mocks.connections.mockResolvedValue([
      { id: "c1", projectId: "p1", project: { ownerId: "u1" } },
    ]);
    mocks.projects.mockResolvedValue([{ id: "p1" }]);
    f.budgets.push(
      ...allocationBudgets("test", { id: "c1", app: "10", programmatic: "10", unit: "cents" }, 1),
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
    await tx.write(async (sql) => {
      await sql.execute(
        Prisma.sql`CREATE TABLE provider_cost_entries (id text PRIMARY KEY,"connectionId" text,"projectId" text,source text,"createdAt" timestamptz,"costCents" numeric(10,4),"credentialSource" text,"measurementStatus" text)`,
      );
      await sql.execute(
        Prisma.sql`INSERT INTO provider_cost_entries VALUES('op','c1','p1','app','2026-09-23','1.0000','own','recorded')`,
      );
    });
    const failure = vi.fn();
    const engine = createShadowEngine({
      meter,
      clock: f.clock,
      namespace: "test",
      handoffs: createPostgresShadowHandoffs({
        prisma: f.client(),
        namespace: "test",
        schema: f.schema,
      }),
      sink: async () => undefined,
      failure,
    });
    const entry: UsageEntry = {
      id: "op",
      ownerId: "u1",
      projectId: "p1",
      connectionId: "c1",
      provider: "search",
      feature: "rank_check",
      source: "app",
      createdAt: f.clock.now(),
      costCents: "1.0001",
      usageQuantity: "1",
      measurementStatus: "recorded",
      cached: false,
      failed: false,
    };
    await engine.begin(entry, { cents: "1.0001", units: "1" });
    await engine.record(entry);
    await engine.begin({ ...entry, id: "pending" }, { cents: "2", units: "1" });
    await engine.record({
      ...entry,
      id: "pending",
      measurementStatus: "unknown",
      usageQuantity: null,
    });
    expect(failure).not.toHaveBeenCalled();
    const page = await readMeteringAdmin({ month: "2026-09", project: "p1" });
    expect(page.usage).toHaveLength(1);
    // A pending operation makes the aggregate's certainty unknown; it cannot show a false precise delta.
    expect(page.usage[0]).toMatchObject({
      connection: "c1",
      meter: null,
      legacy: "1.0000",
      difference: null,
      certainty: "unknown",
      reserved: "2.0000 cents",
    });
    expect(page.budgets.find((b) => b.surface === "app")).toMatchObject({
      used: "1.0001 cents",
      reserved: "2.0000 cents",
      remaining: "6.9999 cents",
    });
    expect(page.exceptions).toEqual([
      expect.objectContaining({ operation: "pending", state: "pending" }),
    ]);
    await engine.record({ ...entry, id: "pending", costCents: "0.0000", usageQuantity: "0" });
    const settled = await readMeteringAdmin({ month: "2026-09", project: "p1" });
    expect(settled.usage[0]).toMatchObject({
      meter: "1.0001",
      difference: "0.0001",
      certainty: "measured",
    });
  } finally {
    await f.close();
  }
});
