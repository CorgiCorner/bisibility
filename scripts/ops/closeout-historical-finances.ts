import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { databasePoolConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  CloseoutExecutionError,
  closeoutFailureCategory,
} from "@/lib/metering/history-closeout/execution-error";
import {
  type CloseoutCandidateQuery,
  listCloseoutCandidates,
} from "@/lib/metering/history-closeout/list";
import {
  closeoutPolicies,
  liveConnectionCloseoutPolicy,
  retiredSettingsCloseoutPolicy,
} from "@/lib/metering/history-closeout/manifest";
import { applyCloseout, previewCloseout } from "@/lib/metering/history-closeout/service";
import { PrismaPg } from "@prisma/adapter-pg";

type Mode = "apply" | "read_only_preview" | "read_only_list";

/** One bounded operator transaction; driver details never cross the output boundary. */
export async function operatorTransaction<T extends object>(
  databaseUrl: string,
  mode: Mode,
  timeoutMs: number,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30000 || timeoutMs > 300000)
    throw new Error("Operator timeout must be explicitly bounded to 30000..300000 milliseconds.");
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
        if (mode !== "apply") await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${schema}"`)}`);
        return work(tx);
      },
      {
        isolationLevel: mode === "apply" ? "ReadCommitted" : "RepeatableRead",
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
        mode,
      },
    };
  } catch (error) {
    throw new CloseoutExecutionError({
      elapsedMs: Math.round(performance.now() - started),
      statements,
      phase,
      timeoutMs,
      maxWaitMs,
      mode,
      ...closeoutFailureCategory(error),
    });
  } finally {
    await db.$disconnect();
  }
}

/** Extended policies additionally need an explicit command-line policy confirmation. */
export function confirmCloseoutPolicy(manifest: unknown, policy?: string) {
  const selected =
    manifest && typeof manifest === "object" ? (manifest as { policy?: unknown }).policy : null;
  if (policy !== undefined && !(closeoutPolicies as readonly string[]).includes(policy))
    throw new Error("Unknown closeout policy.");
  if (policy !== undefined && policy !== selected)
    throw new Error("The --policy confirmation must equal the manifest policy.");
  if ((selected === liveConnectionCloseoutPolicy || selected === retiredSettingsCloseoutPolicy) && policy !== selected)
    throw new Error("This closeout policy requires an explicit matching --policy.");
}

/** Privileged DB operator tool; supplying an administrator ID is audit attribution, not login. */
export async function runHistoricalCloseout(
  databaseUrl: string,
  manifest: unknown,
  approve?: string,
  timeoutMs = 180000,
) {
  if (approve && !/^[a-f0-9]{64}$/.test(approve))
    throw new Error("An exact preview digest is required.");
  return approve
    ? operatorTransaction(databaseUrl, "apply", timeoutMs, (tx) =>
        applyCloseout(tx, manifest, approve),
      )
    : operatorTransaction(databaseUrl, "read_only_preview", timeoutMs, (tx) =>
        previewCloseout(tx, manifest),
      );
}

/** Read-only candidate listing for building a manifest; never an approval or eligibility proof. */
export async function listHistoricalCloseoutCandidates(
  databaseUrl: string,
  query: CloseoutCandidateQuery,
  timeoutMs = 180000,
) {
  return operatorTransaction(databaseUrl, "read_only_list", timeoutMs, (tx) =>
    listCloseoutCandidates(tx, query),
  );
}

const help = `Historical financial closeout (privileged database operator access required)
  --list --namespace <ns> --project <prj_...> --connection <id> [--after <operationId>]
  --list --namespace <ns> --retired-project <internal id> --connection <id> [--after <id>]
  --manifest <file.json> [--policy <id>]                      Read-only preview (default)
  --manifest <file.json> [--policy <id>] --approve <planHash> Apply the exact approved preview
The live-connection policy requires --policy ${liveConnectionCloseoutPolicy}.
The retired-settings policy requires --policy ${retiredSettingsCloseoutPolicy}.
Set DATABASE_URL through your protected environment; never pass it as an argument.`;

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      list: { type: "boolean" },
      namespace: { type: "string" },
      project: { type: "string" },
      "retired-project": { type: "string" },
      connection: { type: "string" },
      after: { type: "string" },
      manifest: { type: "string" },
      policy: { type: "string" },
      approve: { type: "string" },
      "timeout-ms": { type: "string", default: "180000" },
    },
  });
  if (values.help) return help;
  const timeout = Number(values["timeout-ms"]);
  if (values.list) {
    if (values.manifest || values.approve || values.policy)
      throw new Error("--list is read-only and takes no manifest, policy or approval.");
    if (!values.namespace || !values.connection || !values.project === !values["retired-project"])
      throw new Error(
        "--list requires --namespace, --connection and one of --project or --retired-project.",
      );
  } else {
    if (!values.manifest)
      throw new Error("--manifest is required; default mode is read-only preview.");
    if (
      values.namespace ||
      values.project ||
      values["retired-project"] ||
      values.connection ||
      values.after
    )
      throw new Error("Listing options require --list.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for the explicitly selected target.");
  if (values.list)
    return JSON.stringify(
      await listHistoricalCloseoutCandidates(
        url,
        {
          namespace: values.namespace!,
          projectPublicId: values.project,
          retiredProjectId: values["retired-project"],
          connection: values.connection!,
          after: values.after,
        },
        timeout,
      ),
    );
  const manifest = JSON.parse(await readFile(values.manifest!, "utf8"));
  confirmCloseoutPolicy(manifest, values.policy);
  return JSON.stringify(await runHistoricalCloseout(url, manifest, values.approve, timeout));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(await main());
  } catch (error) {
    // Database driver errors may include connection details; never emit them from the operator CLI.
    console.error(
      "Historical closeout refused. Inspect the manifest, target and authenticated operator; no partial batch is committed.",
    );
    if (error instanceof CloseoutExecutionError) console.error(JSON.stringify(error.execution));
    process.exitCode = 1;
  }
}
