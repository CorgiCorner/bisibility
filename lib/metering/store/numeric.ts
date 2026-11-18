import { Prisma } from "@/lib/generated/prisma/client";
import type { PostgresExecutor } from "@usagekit/store-postgres";

/** Decimal.toFixed() without precision preserves every digit and never uses exponents. */
export function exactNumericRows<T>(rows: T[]): T[] {
  for (const row of rows) {
    const fields = row as Record<string, unknown>;
    for (const [name, value] of Object.entries(fields))
      if (Prisma.Decimal.isDecimal(value) && typeof value.toFixed === "function")
        fields[name] = value.toFixed();
      else if (typeof value === "bigint") fields[name] = value.toString();
  }
  return rows;
}

/** Match pg numeric/int8 text results; JSON bodies and ordinary numbers stay untouched. */
export function exactNumericExecutor(executor: PostgresExecutor): PostgresExecutor {
  return {
    query: async <T>(query: Parameters<PostgresExecutor["query"]>[0]) =>
      exactNumericRows(await executor.query<T>(query)),
    execute: (query) => executor.execute(query),
  };
}
