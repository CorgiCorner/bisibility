import { SOURCES_BY_SURFACE } from "@/lib/provider-usage/surface";
import { createMeter } from "@usagekit/meter";
import { expect, it } from "vitest";
import { legacySourceSurfaceSql } from "./admin-surface-sql";
import { allocationBudgets, decimalQuantity, type UsageEntry } from "./mapping";
import { createShadowEngine, type ShadowComparison } from "./shadow-engine";
import { createPostgresShadowHandoffs } from "./shadow-handoff";
import { createPostgresShadowSink } from "./shadow-sink";
import { Prisma, transactions } from "./store/sql";
import { fixture } from "./store/test-fixture";

it("matches SQL legacy totals to the exact unit across connections, surfaces and months", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write((sql) =>
      sql.execute(Prisma.sql`CREATE TABLE provider_cost_entries (
      id text PRIMARY KEY, "connectionId" text NOT NULL, source text NOT NULL,
      "credentialSource" text NOT NULL DEFAULT 'own',
      "createdAt" timestamptz NOT NULL, "costCents" numeric(10,4) NOT NULL,
      "usageQuantity" numeric(18,6) NOT NULL)`),
    );
    f.budgets.push(
      ...["c1", "c2"].flatMap((id) =>
        allocationBudgets(
          "test",
          {
            id,
            unit: id === "c1" ? "cents" : "units",
            app: "1",
            programmatic: "1",
          },
          1,
        ),
      ),
    );
    const meter = createMeter({
      store: f.store,
      clock: f.clock,
      resolveOwnership: async (scope) => ({
        kind: "principal",
        namespace: scope.namespace,
        principal: "owner",
      }),
    });
    const comparisons: ShadowComparison[] = [],
      failures: string[] = [],
      latency: number[] = [];
    const sink = createPostgresShadowSink({
      prisma: f.client(),
      namespace: "test",
      schema: f.schema,
    });
    const engine = createShadowEngine({
      meter,
      clock: f.clock,
      namespace: "test",
      handoffs: createPostgresShadowHandoffs({
        prisma: f.client(),
        namespace: "test",
        schema: f.schema,
      }),
      sink: async (value) => {
        await sink.writeComparison(value);
        comparisons.push(value);
      },
      failure: (_entry, step) => {
        failures.push(step);
      },
    });
    const sources = [...SOURCES_BY_SURFACE.app, ...SOURCES_BY_SURFACE.programmatic];
    for (let i = 0; i < 48; i++) {
      const entry: UsageEntry = {
        id: `seed-${i}`,
        ownerId: `owner-${i % 2}`,
        projectId: `project-${i % 2}`,
        connectionId: i % 2 ? "c1" : "c2",
        provider: "search",
        feature: "rank_check",
        source: sources[i % sources.length] ?? "app",
        credentialSource: i % 3 ? "own" : "hosted",
        createdAt: new Date(i % 4 ? "2026-09-23T12:00:00Z" : "2026-08-31T23:59:59.999Z"),
        costCents: ["0.0001", "12.3456", "0.0100"][i % 3] ?? "0",
        usageQuantity: i % 2 ? "1.000000" : "0.123456",
        measurementStatus: "recorded",
        cached: false,
        failed: i % 5 === 0,
      };
      const started = performance.now();
      await engine.compare(
        entry,
        { cents: entry.costCents, units: entry.usageQuantity ?? "0" },
        "allowed",
      );
      await engine.begin(entry, { cents: entry.costCents, units: entry.usageQuantity ?? "0" });
      const beforeLegacy = performance.now();
      await tx.write((sql) =>
        sql.execute(Prisma.sql`INSERT INTO provider_cost_entries VALUES(
        ${entry.id},${entry.connectionId},${entry.source},${entry.credentialSource ?? "own"},${entry.createdAt},
        ${entry.costCents}::numeric,${entry.usageQuantity}::numeric)`),
      );
      const afterLegacy = performance.now();
      await engine.record(entry);
      latency.push(performance.now() - started - (afterLegacy - beforeLegacy));
      await engine.record(entry);
    }
    expect(failures).toEqual([]);
    const [counts] = await tx.read((sql) =>
      sql.query<{ operations: bigint; probes: bigint; probeRows: bigint }>(Prisma.sql`
        SELECT
          (SELECT count(*) FROM metering_operation) AS operations,
          (SELECT count(*) FROM metering_operation WHERE operation_id LIKE 'admission:%') AS probes,
          (SELECT count(*) FROM metering_shadow WHERE operation_id LIKE 'admission:%') AS "probeRows"`),
    );
    expect(counts).toEqual({ operations: 48n, probes: 0n, probeRows: 48n });
    for (const month of ["08", "09"]) {
      const from = `2026-${month}-01T00:00:00.000Z`,
        to = month === "08" ? "2026-09-01T00:00:00.000Z" : "2026-10-01T00:00:00.000Z";
      const legacy = await tx.read((sql) =>
        sql.query<{
          connection: string;
          surface: string;
          funding: "byok" | "platform";
          cost: string;
          units: string;
        }>(Prisma.sql`
        SELECT "connectionId" AS connection,${legacySourceSurfaceSql} AS surface,
        CASE WHEN "credentialSource"='hosted' THEN 'platform' ELSE 'byok' END AS funding,
        sum("costCents")::text AS cost,sum("usageQuantity")::text AS units
        FROM provider_cost_entries WHERE "createdAt">=${new Date(from)} AND "createdAt"<${new Date(to)}
        GROUP BY 1,2,3 ORDER BY 1,2,3`),
      );
      const page = await meter.usage(
        {
          namespace: "test",
          readablePrincipals: "*",
          readableGroups: "*",
          readablePools: "*",
          canReadBillingDetail: true,
          canManageBudgets: false,
        },
        {
          scope: { kind: "namespace", namespace: "test" },
          from,
          to,
          units: ["cents", "units"],
          groupBy: ["connection", "surface"],
        },
      );
      expect(page.outcome).toBe("ok");
      if (page.outcome !== "ok") throw new Error("Usage unavailable");
      expect(page.value.rows).toHaveLength(legacy.length);
      for (const total of legacy) {
        const row = page.value.rows.find(
          (r) =>
            r.dimensions.connection === total.connection &&
            r.dimensions.surface === total.surface &&
            r.fundingSource === total.funding,
        );
        expect(row?.cost).toEqual({
          certainty: "measured",
          money: { currency: "USD", units: decimalQuantity(total.cost, "cents", 4).value },
        });
        expect(row?.measurements.find((m) => m.unit === "units")?.quantity).toEqual(
          decimalQuantity(total.units, "units", 6),
        );
      }
    }
    const sorted = latency.sort((a, b) => a - b);
    const disagreements = comparisons.filter(
      (c) =>
        c.operationId.startsWith("admission:") && c.legacy === "allowed" && c.meter === "exceeded",
    ).length;
    const fundingSources = {
      byok: comparisons.filter((c) => !c.operationId.startsWith("admission:")).length,
      hosted: comparisons.filter(
        (c) => !c.operationId.startsWith("admission:") && c.funding === "platform",
      ).length,
    };
    process.stdout.write(
      JSON.stringify({
        shadowParity: {
          calls: 48,
          months: 2,
          failures: failures.length,
          disagreements,
          fundingSources: {
            byok: fundingSources.byok - fundingSources.hosted,
            platform: fundingSources.hosted,
          },
          latencyMs: {
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
          },
        },
      }),
    );
  } finally {
    await f.close();
  }
});
