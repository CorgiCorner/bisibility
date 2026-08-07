#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function withSchema(connectionString, schema) {
  const url = new URL(connectionString);
  url.searchParams.set("schema", schema);
  return url.href;
}

function run(command, args, env) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}.`);
  }
}

async function waitForPostgres(connectionString) {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      const result = await client.query("SELECT version() AS version");
      console.log(result.rows[0]?.version);
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw lastError ?? new Error("PostgreSQL did not become ready.");
}

export async function runPostgresMigrationContract() {
  const databaseUrl = required("DATABASE_URL");
  const directUrl = required("DIRECT_URL");
  await waitForPostgres(directUrl);

  const configuredEnv = {
    DATABASE_URL: databaseUrl,
    DIRECT_URL: directUrl,
    DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV ?? "test",
    EXPECT_SINGLE_BASELINE: "1",
  };
  const sentinelEnv = {
    ...configuredEnv,
    DATABASE_URL: withSchema(databaseUrl, "public"),
    DIRECT_URL: withSchema(directUrl, "public"),
  };

  run("npm", ["run", "db:migrate"], sentinelEnv);
  run("npm", ["run", "db:migrate"], configuredEnv);
  run("npm", ["run", "db:migrate"], configuredEnv);
  run(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "./prisma/schema.prisma",
      "--exit-code",
    ],
    configuredEnv,
  );
  run(
    "node",
    [
      "--experimental-transform-types",
      "--import",
      "./lib/temporal/register-loader.mjs",
      "scripts/ci/schema-raw-sql.ts",
    ],
    configuredEnv,
  );
  run("npm", ["run", "test:data-migration-runner-postgres"], configuredEnv);
  run("npm", ["run", "test:baseline-catalog"], configuredEnv);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPostgresMigrationContract().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
