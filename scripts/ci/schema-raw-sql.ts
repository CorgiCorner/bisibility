import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { promoteFirstRunAdministrator } from "@/lib/auth/first-run-account";
import { databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id";
import { withPublicIdWrites } from "@/lib/db/public-id-writes";
import {
  Device,
  LocationKind,
  PrismaClient,
} from "@/lib/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const schema = databaseSchemaFromUrl(databaseUrl);
if (!schema || schema === "public") {
  throw new Error("Schema raw-SQL regression requires a non-public schema.");
}

function prismaFor(connectionString: string) {
  const isolatedSchema = databaseSchemaFromUrl(connectionString);
  return withPublicIdWrites(new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString,
        ...(isolatedSchema ? { options: `-c search_path="${isolatedSchema}"` } : {}),
        max: 1,
      },
      { schema: isolatedSchema },
    ),
  }));
}

async function createHealthFixture(
  prisma: PrismaClient,
  {
    email,
    failed,
    userId,
  }: {
    email: string;
    failed: boolean;
    userId: string;
  },
) {
  await prisma.user.create({
    data: {
      email,
      emailVerified: true,
      id: userId,
      isInstanceAdmin: failed,
      name: failed ? "Public sentinel" : "Schema candidate",
      publicId: makePublicId("usr"),
    },
  });
  await prisma.project.create({
    data: {
      domain: `${userId}.example.com`,
      id: "schema_health_project",
      name: "Schema health regression",
      ownerId: userId,
      publicId: makePublicId("prj"),
    },
  });
  const location = await prisma.location.create({
    data: {
      canonicalKey: `country:${userId}`,
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      kind: LocationKind.country,
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "",
    },
  });
  const keyword = await prisma.keyword.create({
    data: {
      device: Device.desktop,
      id: `keyword_${userId}`,
      location: "United States",
      locationId: location.id,
      projectId: "schema_health_project",
      publicId: makePublicId("kw"),
      text: `schema regression ${userId}`,
    },
  });
  await prisma.rankCheck.create({
    data: {
      checkedAt: new Date(),
      error: failed ? "public sentinel" : null,
      id: `check_${userId}`,
      keywordId: keyword.id,
      provider: "schema-regression",
      publicId: makePublicId("check"),
      status: failed ? "failed" : "running",
    },
  });
}

const publicUrl = new URL(databaseUrl);
publicUrl.searchParams.set("schema", "public");
const publicPrisma = prismaFor(publicUrl.toString());
const schemaPrisma = prismaFor(databaseUrl);

try {
  await createHealthFixture(publicPrisma, {
    email: "public-sentinel@example.com",
    failed: true,
    userId: "public_sentinel",
  });
  await createHealthFixture(schemaPrisma, {
    email: "schema-candidate@example.com",
    failed: false,
    userId: "schema_candidate",
  });

  const [currentSchema] = await schemaPrisma.$queryRaw<Array<{ schema: string }>>`
    SELECT current_schema() AS "schema"
  `;
  assert.equal(currentSchema?.schema, schema);

  const promotion: unknown = await promoteFirstRunAdministrator(
    "schema_candidate",
    "schema-candidate@example.com",
    {
      appVersion: "schema-regression",
      correlationId: "schema-regression",
      sourceIpHash: null,
      sourceIpMasked: null,
      userAgent: null,
    },
  );
  assert.ok(
    promotion === true || promotion === "promoted",
    `Expected configured-schema promotion, received ${String(promotion)}`,
  );
  assert.equal(
    await schemaPrisma.user.count({
      where: { id: "schema_candidate", isInstanceAdmin: true },
    }),
    1,
  );
  assert.equal(
    await schemaPrisma.auditLog.count({
      where: { action: "instance_admin.first_run_completed" },
    }),
    1,
  );

  const { loadCheckHealthStats } = await import("@/lib/queries/check-health");
  const health = await loadCheckHealthStats(
    "schema_health_project",
    new Date(Date.now() - 24 * 60 * 60 * 1_000),
  );
  assert.equal(health.failedCount, 0);
  assert.equal(health.runningCount, 1);

  console.log(`Raw SQL uses configured schema ${schema}: promotion and check health passed.`);
} finally {
  await Promise.all([publicPrisma.$disconnect(), schemaPrisma.$disconnect()]);
}
