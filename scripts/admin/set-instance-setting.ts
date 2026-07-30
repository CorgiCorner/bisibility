#!/usr/bin/env -S node --experimental-transform-types

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  INSTANCE_SETTING_KEYS,
  type InstanceSettingKey,
  isInstanceSettingKey,
  parseInstanceSettingValue,
} from "../../lib/instance-setting-definitions.ts";
import { databaseConnectionConfig } from "../../lib/db/pool-config.ts";
import pg from "pg";

const { Client } = pg;

type SettingDatabase = {
  query: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type SettingOptions = {
  key: InstanceSettingKey;
  value: number;
};

export type SettingUpdate = SettingOptions & {
  changed: boolean;
  previousValue: string | null;
};

export function parseSettingOptions(args: string[] = process.argv.slice(2)): SettingOptions {
  const parsed = parseArgs({
    args,
    options: {
      key: { type: "string" },
      value: { type: "string" },
    },
    strict: true,
  });
  const key = parsed.values.key?.trim() ?? "";
  if (!isInstanceSettingKey(key)) {
    throw new Error(`--key must be one of: ${INSTANCE_SETTING_KEYS.join(", ")}.`);
  }
  const rawValue = parsed.values.value?.trim() ?? "";
  const value = parseInstanceSettingValue(key, rawValue);
  if (value === null) {
    throw new Error("--value must be a positive safe integer.");
  }
  return { key, value };
}

export async function setInstanceSetting(
  db: SettingDatabase,
  { key, value }: SettingOptions,
): Promise<SettingUpdate> {
  await db.query("BEGIN");
  try {
    const previous = await db.query(
      `SELECT "value" FROM "instance_settings" WHERE "key" = $1 FOR UPDATE`,
      [key],
    );
    const previousValue =
      previous.rows.length > 0 && typeof previous.rows[0]?.value === "string"
        ? previous.rows[0].value
        : null;
    await db.query(
      `INSERT INTO "instance_settings" ("key", "value", "updatedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT ("key") DO UPDATE
       SET "value" = EXCLUDED."value", "updatedAt" = NOW()
       RETURNING "key"`,
      [key, String(value)],
    );
    await db.query("COMMIT");
    return { changed: previousValue !== String(value), key, previousValue, value };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function requireDatabaseUrl(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return databaseUrl;
}

async function main() {
  const options = parseSettingOptions();
  const databaseUrl = requireDatabaseUrl();
  const db = new Client({
    connectionString: databaseUrl,
    ...databaseConnectionConfig(databaseUrl),
  });
  await db.connect();
  try {
    const result = await setInstanceSetting(db as SettingDatabase, options);
    console.log(
      `Instance setting ${result.key}: ${result.previousValue ?? "<unset>"} -> ${result.value} (${
        result.changed ? "updated" : "unchanged"
      }).`,
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
