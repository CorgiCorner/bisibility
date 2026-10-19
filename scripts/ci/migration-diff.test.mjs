import assert from "node:assert/strict";
import test from "node:test";
import { assertMigrationDiff, verifyMigrationDiff } from "./migration-diff.mjs";

const empty = { status: 0, stdout: "-- This is an empty migration.\n" };
const sql = '-- DropForeignKey\nALTER TABLE "fixture" DROP CONSTRAINT "fixture_reference";';

test("requires exact complete SQL and matching drift status", () => {
  assert.doesNotThrow(() => assertMigrationDiff(empty, ""));
  assert.doesNotThrow(() => assertMigrationDiff({ status: 2, stdout: `${sql}\n` }, sql));
  for (const result of [
    { status: 0, stdout: sql }, { status: 2, stdout: empty.stdout },
    { status: 2, stdout: `${sql}\nDROP TABLE users;` },
    { status: 2, stdout: sql.replace("fixture_reference", "other_reference") },
    { status: 2, stdout: `${sql}\n-- hidden additional output` },
    { status: 2, stdout: sql, signal: "SIGTERM" },
    { status: 2, stdout: sql, error: new Error("spawn failed") },
    { status: 1, stdout: sql }, { status: null, stdout: sql },
  ]) assert.throws(() => assertMigrationDiff(result, sql));
  for (const result of [{ status: 0, stdout: "" }, { status: 0, stdout: sql }, { status: 2, stdout: sql }]) {
    assert.throws(() => assertMigrationDiff(result, ""));
  }
});

test("validates additional constraints before diff, closes the client and never executes DDL", async () => {
  const trace = [];
  const env = { DIRECT_URL: "postgresql://fixture:fixture@127.0.0.1/fixture?schema=owned_fixture" };
  const options = {
    createClient: () => ({ connect: async () => trace.push("connect"), end: async () => trace.push("end") }),
    verifyAdditional: async (_client, schema) => { trace.push(schema); return ""; },
    capture: (command, args) => {
      trace.push(command);
      assert.deepEqual(args, ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "./prisma/schema", "--script", "--exit-code"]);
      return empty;
    },
  };
  await verifyMigrationDiff(env, options);
  assert.deepEqual(trace, ["connect", "owned_fixture", "end", "npx"]);
  trace.length = 0;
  await assert.rejects(verifyMigrationDiff(env, { ...options,
    verifyAdditional: async () => { trace.push("missing constraint"); throw new Error("missing constraint"); },
  }), /missing constraint/);
  assert.deepEqual(trace, ["connect", "missing constraint", "end"]);
});
