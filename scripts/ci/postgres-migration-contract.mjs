#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { verifySavedKeywordMarketMigration } from "./saved-keyword-market-migration-postgres.ts";
import { verifyWelcomeIntentMigration } from "./welcome-intent-migration-postgres.ts";

const { Client } = pg;

function fixtureUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a PostgreSQL loopback fixture URL.`);
  }
  const forbidden = ["host", "hostaddr", "port", "dbname", "database", "user", "password", "service", "servicefile"];
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.username || !url.password || url.pathname === "/" || !url.pathname ||
    forbidden.some((key) => url.searchParams.has(key)) ||
    url.hash || url.searchParams.getAll("schema").length > 1
  ) {
    throw new Error(`${name} must be a PostgreSQL loopback fixture URL.`);
  }
  const schema = url.searchParams.get("schema");
  if (schema !== null && !/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(schema)) {
    throw new Error(`${name} has an invalid fixture schema.`);
  }
  return url;
}

export function assertMigrationContractInputs(env) {
  if (env.CI !== "true" || env.DEPLOYMENT_ENV !== "test") {
    throw new Error("Migration contract requires CI=true and DEPLOYMENT_ENV=test.");
  }
  const database = fixtureUrl(env.DATABASE_URL, "DATABASE_URL");
  const direct = fixtureUrl(env.DIRECT_URL, "DIRECT_URL");
  const endpoint = (url) => [url.hostname, url.port || "5432", url.pathname, url.username, url.password];
  if (JSON.stringify(endpoint(database)) !== JSON.stringify(endpoint(direct))) {
    throw new Error("Migration contract URLs must identify the same fixture database and credentials.");
  }
  return { databaseUrl: database.href, directUrl: direct.href };
}

function withSchema(connectionString, schema) {
  const url = new URL(connectionString);
  url.searchParams.set("schema", schema);
  return url.href;
}

export async function withOwnedMigrationSchema(env, callback, {
  createClient = (connectionString) => new Client({ connectionString }),
  schema = `migration_contract_${process.pid}_${randomBytes(6).toString("hex")}`,
} = {}) {
  const { databaseUrl, directUrl } = assertMigrationContractInputs(env);
  if (!/^migration_contract_[a-z0-9_]{1,44}$/.test(schema)) {
    throw new Error("Migration contract requires a generated fixture schema name.");
  }
  const client = createClient(directUrl);
  let created = false;
  try {
    await client.connect();
    // No IF NOT EXISTS: a name collision never grants cleanup ownership.
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    return await callback({
      ...env,
      DATABASE_URL: withSchema(databaseUrl, schema),
      DIRECT_URL: withSchema(directUrl, schema),
    });
  } finally {
    try {
      if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  }
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

async function runScopedMigrationContract(env, runCommand) {
  const databaseUrl = env.DATABASE_URL;
  const directUrl = env.DIRECT_URL;
  await verifySavedKeywordMarketMigration(directUrl);
  await verifyWelcomeIntentMigration(directUrl);

  const configuredEnv = {
    ...env,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: directUrl,
    DEPLOYMENT_ENV: env.DEPLOYMENT_ENV,
    EXPECT_FRESH_LEDGER: "1",
  };
  const sentinelEnv = {
    ...configuredEnv,
    DATABASE_URL: withSchema(databaseUrl, "public"),
    DIRECT_URL: withSchema(directUrl, "public"),
  };

  runCommand("npm", ["run", "db:migrate"], sentinelEnv);
  runCommand("npm", ["run", "db:migrate"], configuredEnv);
  runCommand("npm", ["run", "db:migrate"], configuredEnv);
  runCommand(
    "node",
    [
      "--experimental-transform-types",
      "--import",
      "./lib/temporal/register-loader.mjs",
      "scripts/ci/traffic-first-sync-intent-postgres.ts",
    ],
    configuredEnv,
  );
  runCommand(
    "node",
    [
      "--experimental-transform-types",
      "--import",
      "./lib/temporal/register-loader.mjs",
      "scripts/ci/welcome-intent-postgres.ts",
    ],
    configuredEnv,
  );
  runCommand(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "./prisma/schema",
      "--exit-code",
    ],
    configuredEnv,
  );
  runCommand(
    "node",
    [
      "--experimental-transform-types",
      "--import",
      "./lib/temporal/register-loader.mjs",
      "scripts/ci/schema-raw-sql.ts",
    ],
    configuredEnv,
  );
  runCommand("npm", ["run", "test:rank-check-run-launch-postgres"], configuredEnv);
  runCommand("npm", ["run", "test:data-migration-runner-postgres"], configuredEnv);
  runCommand("npm", ["run", "test:baseline-catalog"], configuredEnv);
}

export async function runPostgresMigrationContract({ env = process.env, runCommand = run } = {}) {
  const { directUrl } = assertMigrationContractInputs(env);
  await waitForPostgres(directUrl);
  return withOwnedMigrationSchema(env, (scopedEnv) => runScopedMigrationContract(scopedEnv, runCommand));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPostgresMigrationContract().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
