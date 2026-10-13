import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { PrismaClient } from "../../lib/generated/prisma/client";
import { databasePoolConfig, databaseSchemaFromUrl } from "../../lib/db/pool-config";
import { createPostgresStore } from "../../lib/metering/store";
import { PrismaPg } from "@prisma/adapter-pg";

/** Explicit write initialization before enabling any read-only Meter traffic. */
export async function adoptMeteringTimestamps(databaseUrl: string) {
  const schema = databaseSchemaFromUrl(databaseUrl) ?? "public";
  const prisma = new PrismaClient({ adapter: new PrismaPg({
    connectionString: databaseUrl,
    ...databasePoolConfig({ DATABASE_POOL_MAX: "1", DATABASE_APPLICATION_NAME: "bisibility-utc-adoption" }, databaseUrl),
  }, { schema }) });
  try {
    await createPostgresStore({ prisma, schema, clock: { now: () => new Date() } });
    const [audit] = await prisma.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM "${schema}".metering_metadata WHERE key=$1`,
      "bisibility.transport_fence_audit",
    );
    if (!audit) throw new Error("Committed transport fence audit receipt is missing");
    return { status: "PASS", schema, readonlyReady: true, transportFences: JSON.parse(audit.value) };
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { "legacy-writers-drained": { type: "boolean", default: false } } });
    if (!values["legacy-writers-drained"]) throw new Error("Drain all legacy writers, then invoke with --legacy-writers-drained before enabling Meter read traffic");
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required for explicit Meter UTC adoption");
    console.log(JSON.stringify(await adoptMeteringTimestamps(url)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Meter UTC adoption failed");
    process.exitCode = 1;
  }
}
