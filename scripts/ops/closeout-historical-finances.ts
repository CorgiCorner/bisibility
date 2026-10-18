import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { databasePoolConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { applyCloseout, previewCloseout } from "@/lib/metering/history-closeout/service";
import {
  CloseoutExecutionError,
  closeoutFailureCategory,
} from "@/lib/metering/history-closeout/execution-error";
import { PrismaPg } from "@prisma/adapter-pg";

/** Privileged DB operator tool; supplying an administrator ID is audit attribution, not login. */
export async function runHistoricalCloseout(
  databaseUrl: string,
  manifest: unknown,
  approve?: string,
  timeoutMs = 180000,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30000 || timeoutMs > 300000)
    throw new Error("Operator timeout must be explicitly bounded to 30000..300000 milliseconds.");
  if (approve && !/^[a-f0-9]{64}$/.test(approve))
    throw new Error("An exact preview digest is required.");
  const schema = databaseSchemaFromUrl(databaseUrl) ?? "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema.");
  let statements = 0;
  let phase: "connect" | "warmup" | "transaction" = "connect";
  const maxWaitMs = 30000;
  const started = performance.now();
  const db = new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString: databaseUrl,
        ...databasePoolConfig(
          { DATABASE_POOL_MAX: "1", DATABASE_APPLICATION_NAME: "historical-financial-closeout" },
          databaseUrl,
        ),
      },
      { schema },
    ),
    log: [{ level: "query", emit: "event" }],
  });
  db.$on("query", () => {
    statements++;
  });
  try {
    await db.$connect();
    phase = "warmup";
    await db.$queryRaw`SELECT 1 AS closeout_connection_ready`;
    phase = "transaction";
    const result = await db.$transaction(
      async (tx) => {
        if (!approve) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${schema}"`)}`);
        return approve ? applyCloseout(tx, manifest, approve) : previewCloseout(tx, manifest);
      },
      {
        isolationLevel: approve ? "ReadCommitted" : "RepeatableRead",
        timeout: timeoutMs,
        maxWait: maxWaitMs,
      },
    );
    return {
      ...result,
      execution: {
        elapsedMs: Math.round(performance.now() - started),
        statements,
        timeoutMs,
        maxWaitMs,
        mode: approve ? "apply" : "read_only_preview",
      },
    };
  } catch (error) {
    throw new CloseoutExecutionError({
      elapsedMs: Math.round(performance.now() - started),
      statements,
      phase,
      timeoutMs,
      maxWaitMs,
      mode: approve ? "apply" : "read_only_preview",
      ...closeoutFailureCategory(error),
    });
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({
      options: {
        manifest: { type: "string" },
        approve: { type: "string" },
        "timeout-ms": { type: "string", default: "180000" },
      },
    });
    if (!values.manifest)
      throw new Error("--manifest is required; default mode is read-only preview.");
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required for the explicitly selected target.");
    const manifest = JSON.parse(await readFile(values.manifest, "utf8"));
    console.log(
      JSON.stringify(
        await runHistoricalCloseout(url, manifest, values.approve, Number(values["timeout-ms"])),
      ),
    );
  } catch (error) {
    // Database driver errors may include connection details; never emit them from the operator CLI.
    console.error(
      "Historical closeout refused. Inspect the manifest, target and authenticated operator; no partial batch is committed.",
    );
    if (error instanceof CloseoutExecutionError) console.error(JSON.stringify(error.execution));
    process.exitCode = 1;
  }
}
