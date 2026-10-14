import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id-resources";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { createPostgresStore } from "@/lib/metering/store";
import { paidAttemptClock } from "@/lib/metering/transaction-meter";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import type { BusinessStoreContext } from "./context";

export const businessLocationMigration = "20261012200200_business_location_identity";
const tables = [
  "business_locations",
  "business_identity_revisions",
  "business_identifier_claims",
  "business_match_heads",
  "business_match_decisions",
  "business_assignment_heads",
  "business_assignment_revisions",
  "business_location_mutations",
];

/** Own random database, full real migration chain; never alters or drops the supplied database. */
export async function businessLocationDatabase(
  prefix: "business_locations_" | "bisibility_local_review_" = "business_locations_",
) {
  const adminUrl = process.env.PROVIDER_UI_TEST_DATABASE_URL;
  if (!adminUrl) throw new Error("Owned PostgreSQL fixture URL is required.");
  const base = new URL(adminUrl);
  if (!["127.0.0.1", "localhost", "[::1]", "postgres"].includes(base.hostname))
    throw new Error("Business fixtures require the owned local/CI PostgreSQL server.");
  const name = `${prefix}${randomUUID().replaceAll("-", "")}`;
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  url.searchParams.delete("schema");
  const connectionString = url.href;
  const admin = new pg.Client({
    connectionString: adminUrl,
    ...databaseConnectionConfig(adminUrl),
  });
  const client = new pg.Client({ connectionString, ...databaseConnectionConfig(connectionString) });
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString, ...databaseConnectionConfig(connectionString) }),
  });
  await admin.connect();
  let created = false;
  async function close() {
    const errors: unknown[] = [];
    for (const result of await Promise.allSettled([db.$disconnect(), client.end()]))
      if (result.status === "rejected") errors.push(result.reason);
    try {
      if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } catch (error) {
      errors.push(error);
    }
    try {
      await admin.end();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(errors, "Owned business-location fixture cleanup failed.");
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await client.connect();
    const migrations = (await readdir("prisma/migrations"))
      .filter((entry) => /^\d{14}_/u.test(entry))
      .sort();
    if (!migrations.includes(businessLocationMigration))
      throw new Error("Full business-location expansion migration is missing.");
    for (const migration of migrations)
      await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    const present = await client.query<{ name: string | null }>(
      "SELECT to_regclass(expected.name)::text AS name FROM unnest($1::text[]) AS expected(name)",
      [tables],
    );
    if (
      present.rows.some(({ name: table }) => table === null) ||
      present.rowCount !== tables.length
    )
      throw new Error("Full migrated business schema is unavailable.");
    // The new owned database has no retained ledger. Perform the real write-side
    // Store audit/adoption before opening budget/read traffic, as in the rollout.
    await createPostgresStore({ prisma: db, clock: paidAttemptClock });
    return { client, db, close, connectionString };
  } catch (error) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Business fixture failed with a cleanup error.");
    }
    throw error;
  }
}
export type BusinessPgFixture = Awaited<ReturnType<typeof businessLocationDatabase>>;
export async function seedBusinessProject(fixture: BusinessPgFixture) {
  const suffix = randomUUID();
  const owner = await fixture.db.user.create({
    data: {
      name: "Synthetic owner",
      email: `${suffix}-owner@example.test`,
      publicId: makePublicId("usr"),
    },
  });
  const writer = await fixture.db.user.create({
    data: {
      name: "Synthetic writer",
      email: `${suffix}-writer@example.test`,
      publicId: makePublicId("usr"),
    },
  });
  const project = await fixture.db.project.create({
    data: {
      name: "Synthetic project",
      domain: "example.test",
      publicId: makePublicId("prj"),
      ownerId: owner.id,
    },
  });
  await fixture.db.membership.createMany({
    data: [
      { projectId: project.id, userId: owner.id, role: "viewer", publicId: makePublicId("mbr") },
      { projectId: project.id, userId: writer.id, role: "member", publicId: makePublicId("mbr") },
    ],
  });
  const ownerContext = {
    actor: { id: owner.id, role: "owner", memberships: [{ projectId: project.id, role: "owner" }] },
  } satisfies BusinessStoreContext;
  const writerContext = {
    actor: { id: writer.id, role: "viewer", memberships: [] },
  } satisfies BusinessStoreContext;
  return { project, owner, writer, ownerContext, writerContext };
}
export function identityCommand(projectId: string, cid?: string) {
  return {
    projectId,
    idempotencyKey: randomUUID(),
    role: "subject" as const,
    reason: "Synthetic identity setup",
    identity: {
      name: "Żółta firma",
      domain: "example.test",
      address: "Synthetic private address",
      identifiers: cid
        ? [
            {
              namespace: "google_business" as const,
              engine: "google" as const,
              type: "cid" as const,
              value: cid,
            },
          ]
        : [],
    },
  };
}
export async function seedRetainedObservation(
  fixture: BusinessPgFixture,
  projectId: string,
  options: { cid?: string; observedAt?: string | null; adapterVersion?: string | null } = {},
) {
  const location = await fixture.db.location.create({
    data: {
      canonicalKey: randomUUID(),
      displayName: "Synthetic",
      kind: "city",
      countryCode: "PL",
      gl: "pl",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "Synthetic",
      secondaryGeoName: "Synthetic",
    },
  });
  const keyword = await fixture.db.keyword.create({
    data: {
      projectId,
      publicId: makePublicId("kw"),
      text: "synthetic business",
      location: "Synthetic",
      locationId: location.id,
    },
  });
  const check = await fixture.db.rankCheck.create({
    data: {
      keywordId: keyword.id,
      publicId: makePublicId("check"),
      provider: "synthetic",
      status: "completed",
      requestedDepth: 20,
      normalizationVersion: "synthetic-normalizer-v1",
      position: null,
      checkedAt: new Date("2026-10-01T10:00:00.000Z"),
    },
  });
  const run = await fixture.db.observationRun.create({
    data: {
      rankCheckId: check.id,
      projectId,
      provider: "synthetic",
      surface: "web_serp",
      engine: "google",
      completeness: "unknown",
      configuredScope: { location: "Synthetic", language: "en", device: "desktop" },
      requestPolicy: {
        depth: 20,
        evidence: {
          version: 1,
          observedAt:
            options.observedAt === undefined ? "2026-10-01T10:00:00.000Z" : options.observedAt,
          adapterVersion:
            options.adapterVersion === undefined
              ? "synthetic-observation-v1"
              : options.adapterVersion,
        },
      },
      executedAt: new Date("2026-10-01T10:01:00.000Z"),
    },
  });
  const item = await fixture.db.observationItem.create({
    data: {
      observationRunId: run.id,
      resultKind: "local_pack",
      ordinal: 0,
      blockPosition: 1,
      positionInBlock: 3,
      rankScale: "pack_slot",
      promotion: "organic",
      sourcePage: 1,
      sourceBlockId: "synthetic-block",
      sourceOrdinal: 0,
      observedAt:
        options.observedAt === null
          ? null
          : new Date(options.observedAt ?? "2026-10-01T10:00:00.000Z"),
      businessName: "Żółta firma",
      domain: "example.test",
      cid: options.cid ?? null,
      rawFragment: { mustNotRead: true, review: "Synthetic diagnostic raw" },
    },
  });
  return { keyword, run, item, location };
}
