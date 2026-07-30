#!/usr/bin/env -S node --experimental-transform-types

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { databaseConnectionConfig } from "../../lib/db/pool-config.ts";
import { makePublicId, parsePublicId } from "../../lib/db/public-id.ts";
import pg from "pg";

const { Client } = pg;

type SeedDatabase = {
  query: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type SeedOptions = {
  email: string;
  force: boolean;
};

type SeedResult = {
  changed: boolean;
  id: string;
};

function requireEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();
  if (!email || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    throw new Error("Provide a valid account email with --email or INSTANCE_ADMIN_EMAIL.");
  }
  return email;
}

async function findAccount(db: SeedDatabase, email: string) {
  const accountResult = await db.query(
    `SELECT "id", "publicId", "isInstanceAdmin"
     FROM "users"
     WHERE lower("email") = lower($1)
     ORDER BY "id" ASC
     LIMIT 2`,
    [email],
  );

  if (accountResult.rows.length === 0) {
    throw new Error(`No account exists for ${email}.`);
  }
  if (accountResult.rows.length > 1) {
    throw new Error(`More than one account matches ${email}; refusing an ambiguous update.`);
  }

  return accountResult.rows[0];
}

function requireUserPublicId(account: Record<string, unknown>) {
  const publicId = account.publicId;
  if (typeof publicId !== "string" || parsePublicId(publicId)?.resource !== "user") {
    throw new Error("The target account does not have a strict user public ID.");
  }
  return publicId;
}

async function reassignInstanceAdmin(db: SeedDatabase, email: string): Promise<SeedResult> {
  await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

  try {
    const account = await findAccount(db, email);
    const id = String(account.id);
    const publicId = requireUserPublicId(account);
    const cleared = await db.query(
      `UPDATE "users"
       SET "isInstanceAdmin" = false, "updatedAt" = NOW()
       WHERE "id" <> $1
         AND "isInstanceAdmin" = true
       RETURNING "id"`,
      [id],
    );
    const assigned = await db.query(
      `UPDATE "users"
       SET "isInstanceAdmin" = true, "updatedAt" = NOW()
       WHERE "id" = $1
       RETURNING "id"`,
      [id],
    );

    if (assigned.rows.length === 0) {
      throw new Error(`No account exists for ${email}.`);
    }

    const previousAdministratorIds = cleared.rows.map((row) => String(row.id));
    await db.query(
      `INSERT INTO "audit_logs"
         ("id", "publicId", "actorId", "action", "targetType", "targetId", "before", "after",
          "correlationId", "status", "createdAt")
       VALUES ($1, $2, NULL, 'instance_admin.reassigned', 'user', $3, $4::jsonb, $5::jsonb,
         $6, 'success', NOW())
       RETURNING "id"`,
      [
        randomUUID(),
        makePublicId("audit"),
        publicId,
        JSON.stringify({
          isInstanceAdmin: account.isInstanceAdmin === true,
          previousAdministratorIds,
        }),
        JSON.stringify({ email, isInstanceAdmin: true }),
        randomUUID(),
      ],
    );
    await db.query("COMMIT");

    return {
      changed: account.isInstanceAdmin !== true || previousAdministratorIds.length > 0,
      id,
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export function parseSeedOptions(
  args: string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): SeedOptions {
  const parsed = parseArgs({
    args,
    options: {
      email: { type: "string" },
      force: { default: false, type: "boolean" },
    },
    strict: true,
  });

  return {
    email: requireEmail(parsed.values.email ?? env.INSTANCE_ADMIN_EMAIL),
    force: parsed.values.force,
  };
}

export async function seedInstanceAdmin(
  db: SeedDatabase,
  { email, force }: SeedOptions,
): Promise<SeedResult> {
  if (force) {
    return reassignInstanceAdmin(db, email);
  }

  const account = await findAccount(db, email);
  const id = String(account.id);
  if (account.isInstanceAdmin === true) {
    return { changed: false, id };
  }

  const updateResult = await db.query(
    `UPDATE "users"
     SET "isInstanceAdmin" = true, "updatedAt" = NOW()
     WHERE "id" = $1
       AND NOT EXISTS (
         SELECT 1 FROM "users" WHERE "isInstanceAdmin" = true
       )
     RETURNING "id"`,
    [id],
  );

  if (updateResult.rows.length === 0) {
    throw new Error("An instance administrator already exists. Re-run with --force to override.");
  }

  return { changed: true, id };
}

function requireDatabaseUrl(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return databaseUrl;
}

async function main() {
  const options = parseSeedOptions();
  const databaseUrl = requireDatabaseUrl();
  const db = new Client({
    connectionString: databaseUrl,
    ...databaseConnectionConfig(databaseUrl),
  });
  await db.connect();
  try {
    const result = await seedInstanceAdmin(db as SeedDatabase, options);
    console.log(
      result.changed
        ? `Instance administrator granted to ${options.email}.`
        : `Account ${options.email} is already an instance administrator.`,
    );
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
