import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { PrismaClient } from "../../lib/generated/prisma/client";
import {
  databasePoolConfig,
  databaseSchemaFromUrl,
} from "../../lib/db/pool-config";
import { listHistoricalResolutions } from "../../lib/metering/history-recovery/list";
import { historicalResolutionSchema } from "../../lib/metering/history-recovery/manifest";
import {
  applyHistoricalResolution,
  previewHistoricalResolution,
} from "../../lib/metering/history-recovery/service";
import { encode } from "../../lib/metering/store/codec";
import { Prisma } from "../../lib/metering/store/host-sql";
import { PrismaPg } from "@prisma/adapter-pg";

const help = `Historical BYOK accounting recovery (operator database access required)
  --list --namespace <namespace> [--after <operationId>]
  --manifest <file.json>                         Read-only preview
  --manifest <file.json> --apply --confirm <hash> Apply the exact reviewed preview
Set DATABASE_URL using your normal protected environment. Never paste it into arguments.
See docs/self-hosting/historical-accounting.mdx for evidence requirements.`;

export async function historicalAccountingCli(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: "boolean" },
      list: { type: "boolean" },
      namespace: { type: "string" },
      after: { type: "string" },
      manifest: { type: "string" },
      apply: { type: "boolean" },
      confirm: { type: "string" },
    },
  });
  if (values.help) return { help };
  if (
    values.list
      ? Boolean(
          values.manifest ||
          values.apply ||
          values.confirm ||
          !values.namespace,
        )
      : Boolean(
          !values.manifest ||
          values.namespace ||
          values.after ||
          Boolean(values.apply) !== Boolean(values.confirm),
        )
  )
    throw new Error(
      "Choose list, preview, or apply with a preview hash. Use --help.",
    );
  if (values.confirm && !/^[a-f0-9]{64}$/.test(values.confirm))
    throw new Error("Invalid approval hash.");
  const namespace =
    values.namespace === undefined
      ? undefined
      : z.string().trim().min(1).max(128).parse(values.namespace);
  const manifest = values.manifest
    ? historicalResolutionSchema.parse(
        JSON.parse(await readFile(values.manifest, "utf8")),
      )
    : null;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  const schema = databaseSchemaFromUrl(url) ?? "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema))
    throw new Error("Unsupported database schema identifier.");
  const client = new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString: url,
        ...databasePoolConfig(
          {
            DATABASE_POOL_MAX: "1",
            DATABASE_APPLICATION_NAME: "bisibility-history-resolution",
          },
          url,
        ),
      },
      { schema },
    ),
  });
  try {
    return await client.$transaction(
      async (tx) => {
        if (!values.apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw(
          Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${schema}"`)}`,
        );
        if (values.list)
          return listHistoricalResolutions(tx, namespace!, values.after);
        if (values.apply)
          return applyHistoricalResolution(tx, manifest, values.confirm!);
        const plan = await previewHistoricalResolution(tx, manifest);
        return {
          planHash: plan.planHash,
          replayed: plan.replayed,
          operations: plan.corrections.map((i) => ({
            operationId: i.operationId,
            receiptId: i.receipt.id,
            replacesReceiptId: i.replacesReceiptId,
            occurredAt: i.receipt.occurredAt,
            cost: i.receipt.cost,
            measurements: i.receipt.measurements,
          })),
        };
      },
      {
        timeout: 30000,
        maxWait: 10000,
        isolationLevel: values.apply ? "ReadCommitted" : "RepeatableRead",
      },
    );
  } finally {
    await client.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await historicalAccountingCli(process.argv.slice(2));
    console.log("help" in result ? result.help : encode(result));
  } catch (error) {
    // Prisma/driver errors may contain connection information. Keep them out of terminal output.
    const safe = error instanceof Error && error.constructor === Error;
    console.error(
      safe
        ? error.message
        : "Historical recovery failed. Check the manifest, database access and installed schema; no partial batch was committed.",
    );
    process.exitCode = 1;
  }
}
