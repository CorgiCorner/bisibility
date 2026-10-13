import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runHistoricalImport } from "./host-history-migration";
import { createSql } from "./store/host-sql";

const url = process.env.METERING_TEST_DATABASE_URL;
const schema = process.env.METERING_TEST_SCHEMA;
const phase = process.env.METERING_CRASH_PHASE;
if (!url || !schema || !/^[a-z_][a-z0-9_]*$/.test(schema) || new URL(url).hostname !== "127.0.0.1")
  throw new Error("Isolated local historical test configuration required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(schema)}`);
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  async function barrier() {
    process.on("message", () => {});
    process.send?.({ ready: true });
    await new Promise<void>(() => {});
  }
  await runHistoricalImport(
    {
      ...sql,
      async execute(query) {
        const result = await sql.execute(query);
        if (
          (phase === "history_batch" && query.sql.includes("SET cursor=")) ||
          (phase === "history_reference" && query.sql.includes("UPDATE ai_tracking_samples"))
        )
          await barrier();
        return result;
      },
      async query<T>(query: Prisma.Sql): Promise<T[]> {
        const result = await sql.query<T>(query);
        if (
          phase === "history_verification" &&
          query.sql.includes("SELECT * FROM metering_budget_usage")
        )
          await barrier();
        return result;
      },
    },
    "test",
    1,
  );
  throw new Error("Historical crash phase was not exercised");
});
