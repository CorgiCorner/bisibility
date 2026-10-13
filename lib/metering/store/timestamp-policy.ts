import type { PostgresDriver, PostgresExecutor } from "@usagekit/store-postgres";
import { ensureTimestampContract, requireTimestampContract } from "./timestamp-history";

/** Prisma's timestamp binding and projection require a canonical UTC session. */
export async function setLocalUtc(executor: PostgresExecutor) {
  await executor.execute({ text: "SET LOCAL TIME ZONE 'UTC'", values: [] });
}

export function utcPostgresDriver(driver: PostgresDriver, schema: string): PostgresDriver {
  let initialized = false;
  return {
    async transaction(readOnly, body) {
      const initializing = !initialized;
      const result = await driver.transaction(readOnly, async (executor) => {
        await setLocalUtc(executor);
        if (initializing) {
          await executor.query({
            text: "SELECT set_config('search_path', $1, true)",
            values: [`"${schema}"`],
          });
          if (readOnly) await requireTimestampContract(executor);
          else await ensureTimestampContract(executor);
        }
        return body(executor);
      });
      // An audited marker is durable only after the owned transaction commits.
      if (initializing) initialized = true;
      return result;
    },
  };
}
