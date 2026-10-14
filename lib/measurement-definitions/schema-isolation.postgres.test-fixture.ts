import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { withPreDataMigrations } from "@/scripts/deploy/pre-data-migrations";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

/** Only a new owned database is changed; its public and preview schemas coexist. */
export async function schemaIsolationFixture() {
  const supplied = process.env.PROVIDER_UI_TEST_DATABASE_URL;
  if (!supplied) throw new Error("Owned PostgreSQL fixture URL is required.");
  const base = new URL(supplied);
  if (!["localhost", "127.0.0.1", "[::1]", "postgres"].includes(base.hostname))
    throw new Error("A local owned PostgreSQL server is required.");
  const database = `business_locations_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({
    connectionString: supplied,
    ...databaseConnectionConfig(supplied),
  });
  const url = new URL(supplied);
  url.pathname = `/${database}`;
  const ownerId = randomUUID();
  const projectId = randomUUID();
  const projectPublicId = makePublicId("prj");
  const actor = { id: ownerId, role: "viewer" as const, memberships: [] };
  const opened: Array<{ db: PrismaClient; client: pg.Client }> = [];
  const logs: string[] = [];
  await admin.connect();
  let created = false;
  async function close() {
    const results = await Promise.allSettled(
      opened.flatMap(({ db, client }) => [db.$disconnect(), client.end()]),
    );
    try {
      if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
    const errors = results.filter((result) => result.status === "rejected");
    if (errors.length)
      throw new AggregateError(
        errors.map((result) => result.reason),
        "Owned schema fixture cleanup failed.",
      );
  }
  async function command(args: string[], connectionString: string, migrationsPath?: string) {
    const env = {
      NODE_ENV: "test" as const,
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) =>
          [
            "HOME",
            "USER",
            "LOGNAME",
            "TMPDIR",
            "PATH",
            "LANG",
            "LC_ALL",
            "NODE_OPTIONS",
            "NODE_DISABLE_COMPILE_CACHE",
          ].includes(key),
        ),
      ),
    };
    Object.assign(
      env,
      {
        DATABASE_URL: connectionString,
        DIRECT_URL: connectionString,
        BISIBILITY_FAKE_PROVIDER: "0",
      },
      migrationsPath ? { BISIBILITY_MIGRATIONS_PATH: migrationsPath } : {},
    );
    const child = spawn(process.execPath, args, { env, stdio: "pipe" });
    child.stdin.end();
    let text = "";
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        text += chunk.toString();
      });
    const code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exit) => resolve(exit ?? 1));
    });
    logs.push(text.replaceAll(connectionString, "[OWNED_DATABASE_URL]"));
    if (code)
      throw new Error(`Owned migration pipeline exit ${code}: ${logs.at(-1)?.slice(-2500)}`);
  }
  async function seed(client: pg.Client, name: string) {
    await client.query(
      `INSERT INTO users(id,"publicId",name,email,"updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp())`,
      [ownerId, makePublicId("usr"), name, `${randomUUID()}@example.test`],
    );
    await client.query(
      `INSERT INTO projects(id,"publicId",name,domain,"ownerId","updatedAt") VALUES ($1,$2,$3,'example.test',$4,clock_timestamp())`,
      [projectId, projectPublicId, name, ownerId],
    );
    await client.query(
      `INSERT INTO memberships(id,"publicId","projectId","userId",role,"updatedAt") VALUES ($1,$2,$3,$4,'viewer',clock_timestamp())`,
      [randomUUID(), makePublicId("mbr"), projectId, ownerId],
    );
  }
  async function bootstrap(schema: string, seedBeforeConversion: boolean) {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Unsafe owned fixture schema.");
    url.searchParams.set("schema", schema);
    const connectionString = url.href;
    const client = new pg.Client({
      connectionString,
      ...databaseConnectionConfig(connectionString),
    });
    const db = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, ...databaseConnectionConfig(connectionString) },
        { schema },
      ),
    });
    opened.push({ db, client });
    await client.connect();
    if (schema !== "public") await client.query(`CREATE SCHEMA "${schema}"`);
    if (seedBeforeConversion) {
      await withPreDataMigrations(process.cwd(), (path) =>
        command(
          [
            "node_modules/prisma/build/index.js",
            "--config",
            "prisma.config.ts",
            "migrate",
            "deploy",
          ],
          connectionString,
          path,
        ),
      );
      await seed(client, "Preview retained");
    }
    await command(
      [
        "--experimental-transform-types",
        "--import",
        "./lib/temporal/register-loader.mjs",
        "scripts/deploy/migrate.ts",
      ],
      connectionString,
    );
    if (!seedBeforeConversion) await seed(client, "Public retained");
    const location = await db.location.create({
      data: {
        canonicalKey: randomUUID(),
        displayName: "Synthetic",
        kind: "country",
        countryCode: "US",
        gl: "us",
        hl: "en",
        languageCode: "en",
        languageLabel: "English",
        primaryGeoCode: 2840,
        primaryGeoName: "United States",
        secondaryGeoName: "United States",
      },
    });
    const keyword = await db.keyword.create({
      data: {
        publicId: makePublicId("kw"),
        projectId,
        text: schema,
        locationId: location.id,
        location: "Synthetic",
        device: "desktop",
      },
    });
    return { schema, db, client, keyword };
  }
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    return { bootstrap, close, actor, projectId, projectPublicId, logs };
  } catch (error) {
    await close();
    throw error;
  }
}
