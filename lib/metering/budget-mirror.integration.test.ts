import type { Prisma as PrismaTypes } from "@/lib/generated/prisma/client";
import { expect, it, vi } from "vitest";
import { mirrorConnectionBudgetsSafely } from "./budget-mirror";
import { Prisma } from "./store/sql";
import { fixture } from "./store/test-fixture";

it("rolls back a failed shadow mirror while preserving the legacy allocation transaction", async () => {
  const f = await fixture();
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    await f.close();
  }
});
