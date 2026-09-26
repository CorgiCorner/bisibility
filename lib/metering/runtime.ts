import "server-only";
import { databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { prisma } from "@/lib/db/prisma";
import { createMeter } from "@usagekit/meter";
import { resolveMeteringOwnership } from "./ownership";
import { createPostgresStore } from "./store/index";

export const meteringNamespace = () => process.env.METERING_NAMESPACE ?? "default";
export const meteringSchema = () =>
  databaseSchemaFromUrl(process.env.DATABASE_URL ?? "") ?? "public";
const clock = { now: () => new Date() };
let current: Promise<Awaited<ReturnType<typeof initialize>>> | undefined;
async function initialize() {
  const store = await createPostgresStore({ prisma, clock, schema: meteringSchema() });
  const meter = createMeter({ store, clock, resolveOwnership: resolveMeteringOwnership });
  return { store, meter, clock };
}
export function meteringRuntime() {
  if (!current)
    current = initialize().catch((error) => {
      current = undefined;
      throw error;
    });
  return current;
}
