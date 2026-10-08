import type { Prisma as PrismaTypes } from "@/lib/generated/prisma/client";
import { afterEach, expect, it, vi } from "vitest";

const authority = vi.hoisted(() => vi.fn().mockResolvedValue("legacy"));
vi.mock("@/lib/providers/execution-extension", () => ({
  readDeploymentMeteringAllocationAuthority: authority,
}));

import { guardConnectionFundingMutation, mirrorConnectionBudgetsSafely } from "./budget-mirror";
import { Prisma } from "./store/sql";
import { fixture } from "./store/test-fixture";

afterEach(() => {
  authority.mockReset().mockResolvedValue("legacy");
  vi.unstubAllEnvs();
});

function hostedConnection(tx: PrismaTypes.TransactionClient, source = "hosted") {
  return {
    ...tx,
    providerConnection: {
      findUnique: async () => ({
        id: "connection",
        provider: "dataforseo",
        credentialSource: source,
        creditsAllocationAmountPerMonth: "2.5000",
        creditsProgrammaticAllocationAmountPerMonth: "3.0000",
      }),
    },
  } as unknown as PrismaTypes.TransactionClient;
}

it("rolls back a failed shadow mirror while preserving the legacy allocation transaction", async () => {
  const f = await fixture();
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubEnv("METERING_SHADOW", "on");
  try {
    await f.client().$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO queued_rank_check_tasks(id) VALUES('legacy-write')`,
      );
      const broken = {
        ...tx,
        providerConnection: {
          findUnique: async () => {
            await tx.$executeRaw(
              Prisma.sql`INSERT INTO queued_rank_check_tasks(id) VALUES('shadow-partial')`,
            );
            return tx.$queryRaw(Prisma.sql`SELECT * FROM absent_shadow_table`);
          },
        },
      } as unknown as PrismaTypes.TransactionClient;
      await mirrorConnectionBudgetsSafely(broken, "connection");
      // A caught SQL error alone leaves Postgres aborted. The savepoint must restore it.
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO queued_rank_check_tasks(id) VALUES('legacy-after')`,
      );
    });
    const rows = await f
      .client()
      .$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM ${Prisma.raw(f.schema)}.queued_rank_check_tasks ORDER BY id`,
      );
    expect(rows.map((r) => r.id)).toEqual(["legacy-after", "legacy-write"]);
    expect(log).toHaveBeenCalledWith("[metering] allocation mirror failed", {
      connectionId: "connection",
    });
  } finally {
    log.mockRestore();
    vi.unstubAllEnvs();
    await f.close();
  }
});

it("persists hard customer limits for active ownership even when shadow is off", async () => {
  const f = await fixture();
  authority.mockResolvedValue("active");
  vi.stubEnv("METERING_SHADOW", "off");
  vi.stubEnv("METERING_NAMESPACE", "authoritative");
  try {
    await f.client().$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
      await mirrorConnectionBudgetsSafely(hostedConnection(tx), "connection");
    });
    await f.restart();
    const budgets = await f.store.definedBudgets({
      scope: { kind: "connection", namespace: "authoritative", connection: "connection" },
    });
    expect(budgets).toHaveLength(2);
    expect(
      budgets.map((budget) => ({
        unit: budget.unit,
        onExceed: budget.onExceed,
        limit: budget.limit?.value,
      })),
    ).toEqual([
      { unit: "customer_cents", onExceed: "block", limit: 25000n },
      { unit: "customer_cents", onExceed: "block", limit: 30000n },
    ]);
  } finally {
    await f.close();
  }
});

it("rolls back authoritative allocation writes on failed mirror and blocks source changes/draining", async () => {
  const f = await fixture();
  authority.mockResolvedValue("active");
  vi.stubEnv("METERING_SHADOW", "off");
  try {
    await expect(
      f.client().$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO queued_rank_check_tasks(id) VALUES('allocation-write')`,
        );
        await tx.$executeRaw(Prisma.sql`DROP TABLE metering_budget CASCADE`);
        await mirrorConnectionBudgetsSafely(hostedConnection(tx), "connection");
      }),
    ).rejects.toThrow('relation "metering_budget" does not exist');
    const rows = await f
      .client()
      .$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*) FROM ${Prisma.raw(f.schema)}.queued_rank_check_tasks`,
      );
    expect(rows[0]?.count).toBe(0n);
    const budgets = await f
      .client()
      .$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*) FROM ${Prisma.raw(f.schema)}.metering_budget`,
      );
    expect(budgets[0]?.count).toBe(0n);
    await expect(
      f.client().$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
        await guardConnectionFundingMutation(tx, "connection");
        await mirrorConnectionBudgetsSafely(hostedConnection(tx, "own"), "connection");
      }),
    ).rejects.toThrow("funding source cannot change");
    authority.mockResolvedValue("draining");
    await expect(
      f.client().$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
        await mirrorConnectionBudgetsSafely(hostedConnection(tx), "connection");
      }),
    ).rejects.toThrow("awaits rollback reconciliation");
  } finally {
    await f.close();
  }
});
