import { readFileSync } from "node:fs";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "./host-sql";

export const migrations = [
  "20260924011626_metering_shadow",
  "20261006070000_metering_contract",
  "20261006072000_byok_metering_evidence",
  "20261006072500_byok_metering_namespace",
  "20261006072800_byok_metering_proof_revision",
  "20261006075800_metering_imports",
  "20261011010000_shared_paid_attempt_context",
  "20261011020000_accounting_history_snapshot",
  "20261012001000_metering_utc_writers",
  "20261018190000_historical_financial_closeout",
  "20261028190200_metering_unknown_closeout",
  "20261112220000_metering_native_settlement",
];
export const moneyMigration = migrations.at(-1) as string;

export function migrationsAfter(baseline: string) {
  const index = migrations.indexOf(baseline);
  if (index < 0) throw new Error(`Unknown fixture migration: ${baseline}`);
  return migrations.slice(index + 1);
}

/** Split only outside PostgreSQL strings, identifiers, function bodies and comments. */
export function migrationStatements(source: string) {
  const statements: string[] = [];
  let quote = "",
    blockDepth = 0,
    lineComment = false,
    escaped = false,
    start = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i],
      pair = source.slice(i, i + 2);
    if (lineComment) {
      if (char === "\n") lineComment = false;
    } else if (blockDepth) {
      if (pair === "/*") {
        blockDepth++;
        i++;
      } else if (pair === "*/") {
        blockDepth--;
        i++;
      }
    } else if (quote) {
      if (escaped && char === "\\") i++;
      else if (source.startsWith(quote, i)) {
        if (quote.length === 1 && source[i + 1] === quote) i++;
        else {
          i += quote.length - 1;
          quote = "";
        }
      }
    } else if (pair === "--") {
      lineComment = true;
      i++;
    } else if (pair === "/*") {
      blockDepth = 1;
      i++;
    } else if (char === "'" || char === '"') {
      quote = char;
      escaped = char === "'" && /(?:^|\W)[eE]$/.test(source.slice(0, i));
    } else if (char === "$" && /^(?:\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$)/.test(source.slice(i))) {
      quote = /^(?:\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$)/.exec(source.slice(i))?.[0] ?? "";
      escaped = false;
      i += quote.length - 1;
    } else if (char === ";") {
      const statement = source.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const final = source.slice(start).trim();
  if (final) statements.push(final);
  return statements;
}

export async function applyFixtureMigration(tx: Prisma.TransactionClient, name: string) {
  const sql = readFileSync(
    new URL(`../../../prisma/migrations/${name}/migration.sql`, import.meta.url),
    "utf8",
  );
  for (const statement of migrationStatements(sql)) await tx.$executeRaw(Prisma.raw(statement));
}

export async function initializeFixtureSchema(tx: Prisma.TransactionClient) {
  await tx.$executeRaw(Prisma.sql`CREATE TABLE queued_rank_check_tasks (id text PRIMARY KEY)`);
  for (const migration of migrations) await applyFixtureMigration(tx, migration);
  await tx.$executeRaw`DROP TABLE IF EXISTS metering_shadow`;
}

export async function resetFixtureTables(client: PrismaClient, schema: string) {
  await client.$transaction(
    async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${schema}"`)}`);
      await tx.$executeRaw(Prisma.sql`TRUNCATE TABLE
      metering_history_reference,metering_history_import,metering_paid_attempt_context,
      metering_operation,metering_receipt,metering_measurement,metering_command,
      metering_budget,metering_budget_usage,metering_event,metering_metadata,metering_alert,
      metering_request_command,metering_request_count,metering_usage_evidence,
      metering_import_family,metering_import,queued_rank_check_tasks RESTART IDENTITY CASCADE`);
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
