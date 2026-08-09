import { randomBytes } from "node:crypto";
import pg from "pg";
import { databaseConnectionConfig } from "../../lib/db/schema-config.mjs";

const { Client } = pg;

export function requiredDatabaseUrl(env = process.env) {
  const value = env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "DATABASE_URL is required. Run: DATABASE_URL='postgresql://user:password@host:5432/database' npm run screenshot:dashboard",
    );
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.pathname.replaceAll("/", "")) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL with a database name.");
  }
  return url.href;
}

export function isolatedDatabaseUrl(connectionString, schema) {
  const url = new URL(connectionString);
  url.searchParams.set("schema", schema);
  return url.href;
}

export function screenshotSchemaName() {
  return `bisibility_screenshot_${process.pid}_${randomBytes(6).toString("hex")}`;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function adminDatabaseUrl(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete("schema");
  return url.href;
}

async function withDatabaseClient(connectionString, operation) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ...databaseConnectionConfig(connectionString),
  });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

export async function createScreenshotSchema(connectionString, schema) {
  await withDatabaseClient(adminDatabaseUrl(connectionString), (client) =>
    client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`),
  );
}

export async function dropScreenshotSchema(connectionString, schema) {
  await withDatabaseClient(adminDatabaseUrl(connectionString), (client) =>
    client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`),
  );
}

export async function seededDemoProjectRef(connectionString) {
  const result = await withDatabaseClient(connectionString, (client) =>
    client.query(
      'SELECT "publicId" FROM "projects" WHERE "name" = $1 AND "domain" = $2',
      ["Demo", "acme.dev"],
    ),
  );
  const projectRef = result.rows[0]?.publicId;
  if (result.rowCount !== 1 || typeof projectRef !== "string") {
    throw new Error("Seed did not create exactly one Demo project for acme.dev.");
  }
  return projectRef;
}
