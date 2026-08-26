import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260825213742_provider_connection_allocations/migration.sql",
  ),
  "utf8",
);

describe("provider allocation storage schema", () => {
  it("maps typed nullable allocation columns and preserves the legacy cap", () => {
    expect(schema).toContain("enum ProviderAllocationUnit");
    expect(schema).toMatch(/allocationUnit\s+ProviderAllocationUnit\?/);
    expect(schema).toMatch(/allocationAmountPerMonth\s+Int\?/);
    expect(schema).toMatch(/providerAllocationsInitializedAt\s+DateTime\?/);
    expect(schema).toMatch(/budgetCapCents\s+Int\s+@default\(5000\)/);
  });

  it("maps nullable ledger quantity without a Prisma compound unique", () => {
    expect(schema).toMatch(/usageQuantity\s+Decimal\?\s+@db\.Decimal\(18, 6\)/);
    expect(schema).toContain(
      "A migration-only partial unique index covers non-null connection/request identifiers.",
    );
    expect(schema).not.toMatch(/@@unique\(\[connectionId,\s*providerRequestId\]/);
  });

  it("enforces paired nulls and a positive PostgreSQL integer amount", () => {
    expect(migration).toContain(`CREATE TYPE "ProviderAllocationUnit" AS ENUM ('cents', 'units')`);
    expect(migration).toContain('CONSTRAINT "provider_connections_allocation_pair" CHECK');
    expect(migration).toMatch(/"allocationUnit" IS NULL AND "allocationAmountPerMonth" IS NULL/);
    expect(migration).toMatch(
      /"allocationUnit" IS NOT NULL\s+AND "allocationAmountPerMonth" IS NOT NULL\s+AND "allocationAmountPerMonth" > 0/,
    );
    expect(migration).not.toMatch(/INSERT|UPDATE "provider_connections"/);
    expect(migration).not.toMatch(/UPDATE "projects"/);
    expect(migration).not.toMatch(/dataforseo|serpapi/i);
  });

  it("adds precise positive nullable ledger quantities without historical backfill", () => {
    expect(migration).toContain('ADD COLUMN "usageQuantity" DECIMAL(18,6)');
    expect(migration).toContain('CONSTRAINT "provider_cost_entries_usage_quantity_positive" CHECK');
    expect(migration).toMatch(/"usageQuantity" IS NULL OR "usageQuantity" > 0/);
    expect(migration).not.toMatch(/UPDATE\s+"provider_cost_entries"/i);
    expect(migration).not.toMatch(/SET\s+"usageQuantity"\s*=\s*1/i);
  });

  it("preflights duplicates before creating the exact partial unique index", () => {
    const preflight = migration.indexOf("-- DuplicatePreflight");
    const index = migration.indexOf(
      'CREATE UNIQUE INDEX "provider_cost_entries_connection_request_key"',
    );
    expect(preflight).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(preflight);
    expect(migration).toMatch(
      /GROUP BY "connectionId", "providerRequestId"\s+HAVING COUNT\(\*\) > 1/,
    );
    expect(migration).toContain(
      'ON "provider_cost_entries"("connectionId", "providerRequestId")\nWHERE "providerRequestId" IS NOT NULL;',
    );
    expect(migration).toContain("Reconcile duplicate ledger rows before retrying this migration.");
    expect(migration).not.toMatch(/dataforseo|serpapi/i);
  });
});
