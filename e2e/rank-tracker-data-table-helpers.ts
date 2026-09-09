import assert from "node:assert/strict";
import { databaseConnectionConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id";
import { withPublicIdWrites } from "@/lib/db/public-id-writes";
import { PrismaClient } from "@/lib/generated/prisma/client";
import type { Locator, Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";

type FixtureRow = {
  device: "desktop" | "mobile";
  id: string;
  location: string;
  locationId: string;
  position: number;
  text: string;
};

export type RankTrackerDataTableFixture = {
  checkIds: string[];
  firstGroupedKeyword: string;
  keywordIds: string[];
  locationId: string;
  navigationKeyword: string;
  projectId: string;
};

let cachedPrisma: PrismaClient | null = null;

function assertIsolatedE2eDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  assert(databaseUrl, "DATABASE_URL is required for the Rank Tracker E2E fixture.");
  const parsed = new URL(databaseUrl);
  assert(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "The Rank Tracker E2E fixture only uses local PostgreSQL.",
  );
  const schema = databaseSchemaFromUrl(databaseUrl);
  assert.equal(schema, "bisibility_e2e");
  assert.equal(process.env.CORGICORNER_EPHEMERAL, "1");
  assert.equal(process.env.DEPLOYMENT_ENV, "test");
  return { databaseUrl, schema };
}

function e2ePrisma() {
  const { databaseUrl, schema } = assertIsolatedE2eDatabase();
  cachedPrisma ??= withPublicIdWrites(
    new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: databaseUrl,
          ...databaseConnectionConfig(databaseUrl),
          max: 1,
        },
        { schema },
      ),
    }),
  );
  return cachedPrisma;
}

function fixtureRows(prefix: string, locations: readonly { displayName: string; id: string }[]) {
  const devices = ["desktop", "mobile"] as const;
  const groupedKeywords = Array.from(
    { length: 12 },
    (_, index) => `rt ${prefix} term ${String(index + 1).padStart(2, "0")}`,
  );
  const rows = groupedKeywords.flatMap((text, termIndex) =>
    locations.flatMap((location, locationIndex) =>
      devices.map((device, deviceIndex): FixtureRow => {
        const ordinal =
          termIndex * locations.length * devices.length + locationIndex * 2 + deviceIndex;
        return {
          device,
          id: `${prefix}-keyword-${ordinal + 1}`,
          location: location.displayName,
          locationId: location.id,
          position: ordinal + 1,
          text,
        };
      }),
    ),
  );
  const navigationKeyword = `rt ${prefix} navigation`;
  rows.push({
    device: "desktop",
    id: `${prefix}-keyword-navigation`,
    location: locations[0]?.displayName ?? "",
    locationId: locations[0]?.id ?? "",
    position: 80,
    text: navigationKeyword,
  });
  return { firstGroupedKeyword: groupedKeywords[0] ?? "", navigationKeyword, rows };
}

export async function createRankTrackerDataTableFixture(
  projectRef: string,
  suffix: string,
): Promise<RankTrackerDataTableFixture> {
  assert.match(suffix, /^[a-z0-9-]+$/);
  const prisma = await e2ePrisma();
  const prefix = `rt-e2e-${suffix}`;
  try {
    return await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUniqueOrThrow({
        select: { id: true },
        where: { publicId: projectRef },
      });
      const existingTarget = await tx.keyword.findFirstOrThrow({
        orderBy: { createdAt: "asc" },
        select: { location: true, locationId: true },
        where: { projectId: project.id },
      });
      const location = await tx.location.create({
        data: {
          canonicalKey: `${prefix}:pl`,
          countryCode: "PL",
          displayName: "Poland",
          gl: "pl",
          hl: "pl",
          id: `${prefix}-location-pl`,
          kind: "country",
          languageCode: "pl",
          languageLabel: "Polish",
          primaryGeoName: "Poland",
          secondaryGeoName: "",
        },
      });
      await tx.projectMarket.create({
        data: {
          id: `${prefix}-market-pl`,
          locationId: location.id,
          projectId: project.id,
          publicId: makePublicId("pmkt"),
        },
      });
      const fixture = fixtureRows(prefix, [
        { displayName: existingTarget.location, id: existingTarget.locationId },
        location,
      ]);
      await tx.keyword.createMany({
        data: fixture.rows.map((row) => ({
          device: row.device,
          id: row.id,
          location: row.location,
          locationId: row.locationId,
          projectId: project.id,
          publicId: makePublicId("kw"),
          targetUrl: `https://targets.example.com/${row.id}`,
          text: row.text,
        })),
      });
      const checkIds = fixture.rows.map((row) => `${row.id}-check`);
      await tx.rankCheck.createMany({
        data: fixture.rows.map((row, index) => ({
          checkedAt: new Date("2026-09-05T08:00:00.000Z"),
          id: checkIds[index] ?? `${row.id}-check`,
          keywordId: row.id,
          normalizationVersion: "v1",
          position: row.position,
          previousPosition: row.position + 1,
          provider: "e2e-fake",
          publicId: makePublicId("check"),
          rankingUrl: `https://results.example.org/${row.id}`,
          requestedDepth: 100,
          status: "completed",
        })),
      });
      return {
        checkIds,
        firstGroupedKeyword: fixture.firstGroupedKeyword,
        keywordIds: fixture.rows.map((row) => row.id),
        locationId: location.id,
        navigationKeyword: fixture.navigationKeyword,
        projectId: project.id,
      };
    });
  } catch (error) {
    await prisma.$disconnect();
    cachedPrisma = null;
    throw error;
  }
}

export async function cleanupRankTrackerDataTableFixture(fixture: RankTrackerDataTableFixture) {
  const prisma = await e2ePrisma();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.rankCheck.deleteMany({ where: { id: { in: fixture.checkIds } } });
      await tx.keyword.deleteMany({ where: { id: { in: fixture.keywordIds } } });
      await tx.projectMarket.deleteMany({
        where: { locationId: fixture.locationId, projectId: fixture.projectId },
      });
      await tx.location.deleteMany({ where: { id: fixture.locationId } });
    });
    const [checks, keywords, locations, markets] = await Promise.all([
      prisma.rankCheck.count({ where: { id: { in: fixture.checkIds } } }),
      prisma.keyword.count({ where: { id: { in: fixture.keywordIds } } }),
      prisma.location.count({ where: { id: fixture.locationId } }),
      prisma.projectMarket.count({
        where: { locationId: fixture.locationId, projectId: fixture.projectId },
      }),
    ]);
    assert.deepEqual(
      { checks, keywords, locations, markets },
      { checks: 0, keywords: 0, locations: 0, markets: 0 },
    );
  } finally {
    await prisma.$disconnect();
    cachedPrisma = null;
  }
}

export function rankTrackerTable(page: Page) {
  return page.getByRole("table", { name: "Rank tracker keywords" });
}

export function rankTrackerBody(page: Page) {
  return rankTrackerTable(page).getByTestId("rank-tracker-keywords-body");
}

export function groupedLeafRows(body: Locator, keyword: string) {
  return body.locator('[role="row"][data-depth="1"]').filter({ hasText: keyword });
}
