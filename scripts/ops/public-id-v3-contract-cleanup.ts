#!/usr/bin/env -S node --experimental-transform-types

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { cleanupPublicIdV3N1Artifacts } from "@/lib/public-id-contract/n1-cleanup";
import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import pg from "pg";
import { verifyLiveApplication } from "./public-id-write-gate";

const { Client } = pg;

export function parsePublicIdV3ContractCleanupOptions(args: string[]) {
  const parsed = parseArgs({
    allowPositionals: true,
    args,
    options: {
      "expected-app-release": { type: "string" },
      "health-url": { type: "string" },
    },
    strict: true,
  });
  if (parsed.positionals.length !== 1 || parsed.positionals[0] !== "cleanup") {
    throw new Error("Expected exactly one command: cleanup.");
  }
  return {
    command: "cleanup" as const,
    expectedAppRelease: parsed.values["expected-app-release"],
    healthUrl: parsed.values["health-url"]?.trim(),
  };
}

export async function runPublicIdV3ContractCleanupCommand(
  args = process.argv.slice(2),
) {
  const options = parsePublicIdV3ContractCleanupOptions(args);
  const expectedRelease = await verifyLiveApplication(
    options.expectedAppRelease,
    options.healthUrl,
  );
  const databaseUrl = (process.env.DIRECT_URL ?? process.env.DATABASE_URL)?.trim();
  if (!databaseUrl) throw new Error("DIRECT_URL or DATABASE_URL is required.");

  const db = new Client({
    connectionString: databaseUrl,
    ...databaseConnectionConfig(databaseUrl),
  });
  await db.connect();
  try {
    await verifyLiveApplication(expectedRelease, options.healthUrl);
    const result = await cleanupPublicIdV3N1Artifacts(
      db as unknown as PublicIdMigrationDatabase,
      expectedRelease,
      "operator",
    );
    return {
      appRelease: expectedRelease,
      appReleaseVerified: true,
      command: options.command,
      ...result,
    };
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPublicIdV3ContractCleanupCommand()
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
