import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";

export async function isolatedTrackingDatabase() {
  const connectionString = process.env.AI_TRACKING_TEST_DATABASE_URL;
  if (!connectionString)
    throw new Error("AI_TRACKING_TEST_DATABASE_URL must point to disposable local PostgreSQL.");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Local PostgreSQL required.");
  const schema = `ai_tracking_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set("schema", schema);
  function command(args: string[]) {
    const result = spawnSync("node", ["node_modules/prisma/build/index.js", ...args], {
      env: { ...process.env, DATABASE_URL: url.href, DIRECT_URL: url.href },
      encoding: "utf8",
    });
    if (result.status !== 0)
      throw new Error(result.stderr || "Prisma migration validation failed.");
    return result.stdout;
  }
  try {
    command(["migrate", "deploy"]);
    const repeat = command(["migrate", "deploy"]);
    if (!repeat.includes("No pending migrations"))
      throw new Error("Second migration deployment was not idempotent.");
    const diff = command([
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema",
      "--script",
    ]);
    if (diff.trim() !== "-- This is an empty migration.")
      throw new Error(`Migration schema drift: ${diff}`);
    const client = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, options: `-c search_path="${schema}"` },
        { schema },
      ),
    });
    return {
      client,
      schema,
      async dispose() {
        await client.$disconnect();
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
      },
    };
  } catch (error) {
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    throw error;
  }
}
export async function trackingProject(client: PrismaClient, suffix: string) {
  const user = await client.user.create({
    data: { publicId: makePublicId("usr"), email: `${suffix}@tracking-test.invalid`, name: suffix },
  });
  const project = await client.project.create({
    data: { publicId: makePublicId("prj"), name: suffix, ownerId: user.id },
  });
  await client.membership.create({
    data: { publicId: makePublicId("mbr"), projectId: project.id, userId: user.id, role: "owner" },
  });
  const connection = await client.providerConnection.create({
    data: {
      publicId: makePublicId("conn"),
      projectId: project.id,
      provider: "dataforseo",
      kind: "serp",
      status: "connected",
    },
  });
  return { project, connection };
}
