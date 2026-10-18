import { spawnSync } from "node:child_process";
import pg from "pg";
import { verifyAdditionalMigrationConstraints } from "./migration-diff-extension.mjs";

export function assertMigrationDiff(result, expectedScript) {
  if (result.error || result.signal || ![0, 2].includes(result.status)) {
    throw new Error("Schema drift inspection failed before a complete SQL result was available.");
  }
  const expected = expectedScript || "-- This is an empty migration.";
  if (result.status !== (expectedScript ? 2 : 0) || result.stdout?.trim() !== expected) {
    throw new Error("Schema drift differs from the independently verified migration contract.");
  }
}

export async function verifyMigrationDiff(env, {
  createClient = (connectionString) => new pg.Client({ connectionString }),
  verifyAdditional = verifyAdditionalMigrationConstraints,
  capture = spawnSync,
} = {}) {
  const schema = new URL(env.DIRECT_URL).searchParams.get("schema") || "public";
  const client = createClient(env.DIRECT_URL);
  let expectedScript;
  try {
    await client.connect();
    // Validate SQL-owned objects even when introspection would report no drift.
    expectedScript = await verifyAdditional(client, schema);
  } finally {
    await client.end();
  }
  const result = capture("npx", [
    "prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "./prisma/schema",
    "--script", "--exit-code",
  ], { env: { ...process.env, ...env }, encoding: "utf8" });
  assertMigrationDiff(result, expectedScript);
  console.log("Schema drift matches the independently verified migration contract.");
}
