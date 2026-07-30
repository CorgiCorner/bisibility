#!/usr/bin/env -S node --experimental-transform-types

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { databaseConnectionConfig } from "../../lib/db/pool-config.ts";
import { makePublicId, parsePublicId } from "../../lib/db/public-id.ts";
import pg from "pg";

const { Client } = pg;

type ResetDatabase = {
  query: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type ResetTwoFactorOptions = {
  confirmResetTwoFactor: boolean;
  email: string;
  operatorEmail: string;
};

type ResetTwoFactorResult = {
  factorCount: number;
  grantCount: number;
  id: string;
  sessionCount: number;
};

function requireEmail(value: string | undefined, option: string) {
  const email = value?.trim().toLowerCase();
  if (!email || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    throw new Error(`Provide a valid account email with ${option}.`);
  }
  return email;
}

async function findExactAccount(
  db: ResetDatabase,
  email: string,
  role: "operator" | "target",
) {
  const result = await db.query(
    `SELECT "id", "publicId", "isInstanceAdmin", "twoFactorEnabled"
     FROM "users"
     WHERE lower("email") = lower($1)
     ORDER BY "id" ASC
     LIMIT 2
     FOR UPDATE`,
    [email],
  );
  if (result.rows.length === 0) {
    throw new Error(`No ${role} account exists for ${email}.`);
  }
  if (result.rows.length > 1) {
    throw new Error(`More than one ${role} account matches ${email}; refusing an ambiguous reset.`);
  }
  return result.rows[0];
}

function requireUserPublicId(account: Record<string, unknown>) {
  const publicId = account.publicId;
  if (typeof publicId !== "string" || parsePublicId(publicId)?.resource !== "user") {
    throw new Error("The target account does not have a strict user public ID.");
  }
  return publicId;
}

export function parseResetTwoFactorOptions(
  args: string[] = process.argv.slice(2),
): ResetTwoFactorOptions {
  const parsed = parseArgs({
    args,
    options: {
      "confirm-reset-2fa": { default: false, type: "boolean" },
      email: { type: "string" },
      "operator-email": { type: "string" },
    },
    strict: true,
  });

  const options = {
    confirmResetTwoFactor: parsed.values["confirm-reset-2fa"],
    email: requireEmail(parsed.values.email, "--email"),
    operatorEmail: requireEmail(parsed.values["operator-email"], "--operator-email"),
  };
  if (!options.confirmResetTwoFactor) {
    throw new Error("Pass --confirm-reset-2fa after verifying the account owner's identity.");
  }
  return options;
}

export async function resetTwoFactor(
  db: ResetDatabase,
  options: ResetTwoFactorOptions,
): Promise<ResetTwoFactorResult> {
  await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const operator = await findExactAccount(db, options.operatorEmail, "operator");
    if (operator.isInstanceAdmin !== true) {
      throw new Error("The operator account is not an instance administrator.");
    }
    const target = await findExactAccount(db, options.email, "target");
    const operatorId = String(operator.id);
    const targetId = String(target.id);
    const targetPublicId = requireUserPublicId(target);

    const factors = await db.query(
      `DELETE FROM "twoFactor"
       WHERE "userId" = $1
       RETURNING "id"`,
      [targetId],
    );
    await db.query(
      `UPDATE "users"
       SET "twoFactorEnabled" = false, "updatedAt" = NOW()
       WHERE "id" = $1
       RETURNING "id"`,
      [targetId],
    );
    const sessions = await db.query(
      `DELETE FROM "sessions"
       WHERE "userId" = $1
       RETURNING "id"`,
      [targetId],
    );
    const grants = await db.query(
      `DELETE FROM "verifications"
       WHERE ("identifier" LIKE 'trust-device-%' AND "value" = $1)
          OR "identifier" LIKE $2
          OR ("identifier" LIKE 'two-factor-step-up:%' AND "value" LIKE $3)
       RETURNING "id"`,
      [targetId, `two-factor-enrollment:${targetId}:%`, `${targetId}:%`],
    );
    await db.query(
      `INSERT INTO "audit_logs"
         ("id", "publicId", "actorId", "action", "targetType", "targetId", "before", "after",
          "correlationId", "status", "createdAt")
       VALUES ($1, $2, $3, 'instance_admin.account_two_factor_reset', 'user', $4,
         $5::jsonb, $6::jsonb, $7, 'success', NOW())
       RETURNING "id"`,
      [
        randomUUID(),
        makePublicId("audit"),
        operatorId,
        targetPublicId,
        JSON.stringify({
          enabled: target.twoFactorEnabled === true,
          factorCount: factors.rows.length,
        }),
        JSON.stringify({
          enabled: false,
          grantsRevoked: grants.rows.length,
          sessionsRevoked: sessions.rows.length,
        }),
        randomUUID(),
      ],
    );
    await db.query("COMMIT");

    return {
      factorCount: factors.rows.length,
      grantCount: grants.rows.length,
      id: targetId,
      sessionCount: sessions.rows.length,
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function requireDatabaseUrl(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  return databaseUrl;
}

async function main() {
  const options = parseResetTwoFactorOptions();
  const databaseUrl = requireDatabaseUrl();
  const db = new Client({
    connectionString: databaseUrl,
    ...databaseConnectionConfig(databaseUrl),
  });
  await db.connect();
  try {
    const result = await resetTwoFactor(db as ResetDatabase, options);
    console.log(
      `Two-factor authentication reset for ${options.email}; revoked ${result.sessionCount} session(s) and ${result.grantCount} pending grant(s).`,
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
