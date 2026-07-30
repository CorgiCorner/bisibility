#!/usr/bin/env -S node --experimental-transform-types

import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { cleanupPublicIdV3N1Artifacts } from "@/lib/public-id-contract/n1-cleanup";
import { backfillPostReleasePublicIdLedger } from "@/lib/public-id-contract/post-release-ledger";
import {
  publicIdV3N1WriteGateContext,
  reblockPublicIdV3N1WriteGate,
  type PublicIdV3N1WriteGateContext,
} from "@/lib/public-id-contract/n1-write-gate";
import { readPublicIdContractReadiness } from "@/lib/public-id-contract/readiness";
import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import pg from "pg";
import { migrationDatabaseUrl, runDataMigrations } from "../data-migrations/run";

const { Client } = pg;
type PrismaRuntime = {
  cli: string;
  config: string;
};

type MigrationDatabaseClient = PublicIdMigrationDatabase & {
  connect: () => Promise<void>;
  end: () => Promise<void>;
};

type MigrationDatabaseEnvironment = {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
  DIRECT_URL?: string;
};

type MigrationProcessEnvironment = MigrationDatabaseEnvironment & {
  APP_VERSION?: string;
  DEPLOYMENT_ENV?: string;
};

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePrismaRuntime(
  projectRoot: string,
  pathExists: (path: string) => Promise<boolean> = exists,
): Promise<PrismaRuntime> {
  const packaged = {
    cli: join(projectRoot, "migrate-cli", "node_modules", "prisma", "build", "index.js"),
    config: join(projectRoot, "migrate-cli", "prisma.config.ts"),
  };
  if ((await pathExists(packaged.cli)) && (await pathExists(packaged.config))) {
    return packaged;
  }
  const local = {
    cli: join(projectRoot, "node_modules", "prisma", "build", "index.js"),
    config: join(projectRoot, "prisma.config.ts"),
  };
  if ((await pathExists(local.cli)) && (await pathExists(local.config))) {
    return local;
  }
  throw new Error("Prisma migrate deploy runtime is incomplete.");
}

export function migrationWriteGateContext(env: MigrationProcessEnvironment = process.env) {
  return publicIdV3N1WriteGateContext(env);
}

export async function runPrismaMigrateDeploy(
  runtime: PrismaRuntime,
  projectRoot: string,
) {
  const child = spawn(
    process.execPath,
    [runtime.cli, "--config", runtime.config, "migrate", "deploy"],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    throw new Error(`Prisma migrate deploy failed with exit code ${code}.`);
  }
}

export async function reblockMigrationWriteGate(
  context: PublicIdV3N1WriteGateContext,
  allowFreshBlockedN: boolean,
  env: MigrationDatabaseEnvironment = process.env,
  createClient: (config: pg.ClientConfig) => MigrationDatabaseClient = (config) =>
    new Client(config) as unknown as MigrationDatabaseClient,
  reblock: typeof reblockPublicIdV3N1WriteGate = reblockPublicIdV3N1WriteGate,
) {
  const url = migrationDatabaseUrl(env);
  const db = createClient({
    connectionString: url,
    ...databaseConnectionConfig(url),
  });
  await db.connect();
  try {
    return await reblock(db, context, { allowFreshBlockedN });
  } finally {
    await db.end();
  }
}

export async function backfillMigrationLedger(
  context: PublicIdV3N1WriteGateContext,
  env: MigrationDatabaseEnvironment = process.env,
  createClient: (config: pg.ClientConfig) => MigrationDatabaseClient = (config) =>
    new Client(config) as unknown as MigrationDatabaseClient,
  backfill: typeof backfillPostReleasePublicIdLedger = backfillPostReleasePublicIdLedger,
) {
  const url = migrationDatabaseUrl(env);
  const db = createClient({
    connectionString: url,
    ...databaseConnectionConfig(url),
  });
  await db.connect();
  try {
    return await backfill(db, context);
  } finally {
    await db.end();
  }
}

export async function cleanupAutomaticMigrationArtifacts(
  context: PublicIdV3N1WriteGateContext,
  env: MigrationDatabaseEnvironment = process.env,
  createClient: (config: pg.ClientConfig) => MigrationDatabaseClient = (config) =>
    new Client(config) as unknown as MigrationDatabaseClient,
  cleanup: typeof cleanupPublicIdV3N1Artifacts = cleanupPublicIdV3N1Artifacts,
) {
  if (context.releasePolicy !== "automatic") return null;
  const url = migrationDatabaseUrl(env);
  const db = createClient({
    connectionString: url,
    ...databaseConnectionConfig(url),
  });
  await db.connect();
  try {
    return await cleanup(db, context.targetAppRelease, "automatic");
  } finally {
    await db.end();
  }
}

export async function readFinalMigrationContract(
  env: MigrationDatabaseEnvironment = process.env,
  createClient: (config: pg.ClientConfig) => MigrationDatabaseClient = (config) =>
    new Client(config) as unknown as MigrationDatabaseClient,
) {
  const url = migrationDatabaseUrl(env);
  const db = createClient({
    connectionString: url,
    ...databaseConnectionConfig(url),
  });
  await db.connect();
  try {
    return await readPublicIdContractReadiness({
      $queryRawUnsafe: async <T>(query: string) => {
        const result = await db.query(query);
        return result.rows as T;
      },
    });
  } finally {
    await db.end();
  }
}

type MigrationPipeline = {
  backfill: (context: PublicIdV3N1WriteGateContext) => Promise<unknown>;
  cleanup: (context: PublicIdV3N1WriteGateContext) => Promise<unknown>;
  prisma: () => Promise<void>;
  readFinalContract: () => Promise<boolean>;
  reblock: (
    context: PublicIdV3N1WriteGateContext,
    allowFreshBlockedN: boolean,
  ) => Promise<{ installed: boolean; transitioned: boolean }>;
  runData: () => Promise<void>;
};

export async function runMigrationPipeline(
  context: PublicIdV3N1WriteGateContext,
  pipeline: MigrationPipeline,
) {
  const beforePrisma = await pipeline.reblock(context, true);
  if (beforePrisma.installed) await pipeline.backfill(context);
  await pipeline.prisma();
  const afterPrisma = await pipeline.reblock(context, true);
  if (!afterPrisma.installed && !(await pipeline.readFinalContract())) {
    throw new Error("Prisma migrate deploy did not install the public ID v3 write gate.");
  }
  await pipeline.runData();
  await pipeline.cleanup(context);
  return { afterPrisma, beforePrisma };
}

export async function runMigrations() {
  const context = migrationWriteGateContext();
  const projectRoot = dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
  const runtime = await resolvePrismaRuntime(projectRoot);
  await runMigrationPipeline(context, {
    backfill: backfillMigrationLedger,
    cleanup: cleanupAutomaticMigrationArtifacts,
    prisma: () => runPrismaMigrateDeploy(runtime, projectRoot),
    readFinalContract: readFinalMigrationContract,
    reblock: reblockMigrationWriteGate,
    runData: runDataMigrations,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
