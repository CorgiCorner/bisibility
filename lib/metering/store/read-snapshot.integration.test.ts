import { readProjectBudgetStatuses } from "@/lib/metering/project-budget-statuses";
import { projectSnapshotStatusReader } from "@/lib/metering/read-snapshot";
import type { AccessContext } from "@usagekit/core";
import { createMeter } from "@usagekit/meter";
import { type PostgresExecutor, prismaPostgresExecutor } from "@usagekit/store-postgres";
import { expect, test } from "vitest";
import { createSql, Prisma, type Sql } from "./host-sql";
import { exactNumericExecutor } from "./numeric";
import { withBudgetReadExecutor } from "./read-snapshot";
import { fixture } from "./test-fixture";

test("source-specific budget reads share one read-only PostgreSQL snapshot", async () => {
  const f = await fixture();
  try {
    f.clock.set("2026-11-17T00:00:00Z");
    for (const surface of ["any", "app", "api", "worker", "mcp"] as const) {
      await f.store.putBudget({
        id: `project-cap-${surface}`,
        version: 1,
        scope: { kind: "group", namespace: "snapshot-test", group: "project" },
        surface,
        unit: "budget_cents",
        limit: { unit: "budget_cents", value: 100n, scale: 0 },
        onExceed: "block",
        window: { kind: "calendar_month", timezone: "UTC" },
      });
    }
    const meter = createMeter({ store: f.store, clock: f.clock });
    const access: AccessContext = {
      namespace: "snapshot-test",
      readablePrincipals: ["owner"],
      readableGroups: ["project"],
      readablePools: [],
      canReadBillingDetail: true,
      canManageBudgets: false,
    };
    const project = { id: "project", ownerId: "owner" };
    const baseline = await readProjectBudgetStatuses(meter, access, project, []);
    const queries: string[] = [];
    const result = await f.client().$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
        const raw = exactNumericExecutor(prismaPostgresExecutor(tx));
        const executor: PostgresExecutor = {
          query: (query) => {
            queries.push(query.text);
            return raw.query(query);
          },
          execute: (query) => raw.execute(query),
        };
        const base = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
        const sql: Sql = {
          ...base,
          query: (query) => {
            queries.push(query.text);
            return base.query(query);
          },
        };
        return withBudgetReadExecutor(
          executor,
          () => readProjectBudgetStatuses(meter, access, project, []),
          projectSnapshotStatusReader(sql, f.clock.now()),
        );
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
    expect(result).toEqual(baseline);
    expect(result).toHaveLength(7);
    expect(queries.filter((query) => /FROM metering_budget b/.test(query))).toHaveLength(2);
    expect(queries.filter((query) => /FROM metering_budget_usage/.test(query))).toHaveLength(5);
  } finally {
    await f.close();
  }
}, 30000);
