#!/usr/bin/env -S node --experimental-transform-types

import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runDataMigrations } from "../data-migrations/run";

type PrismaRuntime = {
  cli: string;
  config: string;
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

type MigrationPipeline = {
  prisma: () => Promise<void>;
  runData: () => Promise<void>;
};

export async function runMigrationPipeline(pipeline: MigrationPipeline) {
  await pipeline.prisma();
  await pipeline.runData();
}

export async function runMigrations() {
  const projectRoot = dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
  const runtime = await resolvePrismaRuntime(projectRoot);
  await runMigrationPipeline({
    prisma: () => runPrismaMigrateDeploy(runtime, projectRoot),
    runData: runDataMigrations,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
