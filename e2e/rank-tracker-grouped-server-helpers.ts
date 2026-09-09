import assert from "node:assert/strict";
import { databaseConnectionConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { withPublicIdWrites } from "@/lib/db/public-id-writes";
import { type Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { Locator } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";

const GROUP_COUNT = 251;
const TARGETS_PER_GROUP = 4;
export const GROUPED_TARGET_COUNT = GROUP_COUNT * TARGETS_PER_GROUP;
type Target = { d: "desktop" | "mobile"; id: string; l: string; publicId: string; text: string };
export type RankTrackerGroupedServerFixture = {
  checkIds: string[];
  filterKeyword: string;
  keywordIds: string[];
  locationIds: string[];
  locationKey: string;
  marketIds: string[];
  scheduleId: string;
  tagId: string;
  targetCount: number;
};

let cachedPrisma: PrismaClient | null = null;

function assertIsolatedE2eDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  assert(databaseUrl, "DATABASE_URL is required for the grouped Rank Tracker E2E fixture.");
  const parsed = new URL(databaseUrl);
  assert(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "The grouped Rank Tracker E2E fixture only uses local PostgreSQL.",
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
        { connectionString: databaseUrl, ...databaseConnectionConfig(databaseUrl), max: 1 },
        { schema },
      ),
    }),
  );
  return cachedPrisma;
}

type IdPrefix = "check" | "kw" | "pmkt" | "sch" | "tag";
function exactPublicId(prefix: IdPrefix, suffix: string, index: number) {
  const seed = suffix.replace(/[^a-z0-9]/g, "").slice(-16);
  const id = `a${index.toString(36).padStart(6, "0")}${seed}`.slice(0, 24).padEnd(24, "a");
  return `${prefix}_${id}`;
}

function targets(prefix: string, locationIds: readonly string[]) {
  const filterKeyword = `${prefix} filter target`;
  return Array.from({ length: GROUP_COUNT }, (_, groupIndex) =>
    Array.from({ length: TARGETS_PER_GROUP }, (_, targetIndex): Target => {
      const ordinal = groupIndex * TARGETS_PER_GROUP + targetIndex;
      return {
        d: targetIndex % 2 === 0 ? "desktop" : "mobile",
        id: `${prefix}-keyword-${String(ordinal + 1).padStart(4, "0")}`,
        l: locationIds[Math.floor(targetIndex / 2)] ?? "",
        publicId: exactPublicId("kw", prefix, ordinal),
        text:
          groupIndex === 0
            ? filterKeyword
            : `${prefix} grouped target ${String(groupIndex).padStart(3, "0")}`,
      };
    }),
  ).flat();
}

export async function createRankTrackerGroupedServerFixture(
  projectRef: string,
  suffix: string,
): Promise<RankTrackerGroupedServerFixture> {
  assert.match(suffix, /^[a-z0-9-]+$/);
  const prisma = e2ePrisma();
  const prefix = `rt-gs-${suffix}`;
  const locationIds = [`${prefix}-location-us`, `${prefix}-location-pl`];
  const locationKey = `${prefix}:us`;
  const fixtureTargets = targets(prefix, locationIds);
  const keywordIds = fixtureTargets.map((target) => target.id);
  const checkIds: string[] = [];
  const scheduleId = `${prefix}-schedule-manual`;
  const tagId = `${prefix}-tag-filter`;
  const marketIds = locationIds.map((_, index) => `${prefix}-market-${index + 1}`);
  const filterKeyword = fixtureTargets[0]?.text ?? "";
  const filterTag = `${prefix} filter`;
  const metricRaw = { serpFeatures: ["image"], volume: 12_000 } satisfies Prisma.InputJsonValue;

  try {
    return await prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findUniqueOrThrow({
          select: { id: true },
          where: { publicId: projectRef },
        });
        await tx.location.createMany({
          data: [
            {
              canonicalKey: locationKey,
              countryCode: "US",
              displayName: "United States",
              gl: "us",
              hl: "en",
              id: locationIds[0] ?? "",
              kind: "country",
              languageCode: "en",
              languageLabel: "English",
              primaryGeoName: "United States",
              secondaryGeoName: "",
            },
            {
              canonicalKey: `${prefix}:pl`,
              countryCode: "PL",
              displayName: "Poland",
              gl: "pl",
              hl: "pl",
              id: locationIds[1] ?? "",
              kind: "country",
              languageCode: "pl",
              languageLabel: "Polish",
              primaryGeoName: "Poland",
              secondaryGeoName: "",
            },
          ],
        });
        await tx.projectMarket.createMany({
          data: locationIds.map((locationId, index) => ({
            id: marketIds[index] ?? "",
            locationId,
            projectId: project.id,
            publicId: exactPublicId("pmkt", prefix, index),
          })),
        });
        await tx.checkSchedule.create({
          data: {
            enabled: false,
            frequency: "manual",
            id: scheduleId,
            name: `${prefix} inactive manual schedule`,
            projectId: project.id,
            publicId: exactPublicId("sch", prefix, 0),
            timezone: "UTC",
          },
        });
        await tx.tag.create({
          data: {
            id: tagId,
            name: filterTag,
            projectId: project.id,
            publicId: exactPublicId("tag", prefix, 0),
          },
        });
        await tx.keyword.createMany({
          data: fixtureTargets.map((target, index) => ({
            checkScheduleId: scheduleId,
            device: target.d,
            id: target.id,
            intent: index < TARGETS_PER_GROUP ? "commercial" : null,
            location: target.l === locationIds[0] ? "United States" : "Poland",
            locationId: target.l,
            projectId: project.id,
            publicId: target.publicId,
            targetUrl: `https://example.com/${target.id}`,
            text: target.text,
            topic: index < TARGETS_PER_GROUP ? `${prefix} topic` : null,
          })),
        });
        await tx.keywordSchedule.createMany({
          data: keywordIds.map((keywordId, index) => ({
            id: `${prefix}-keyword-schedule-${String(index + 1).padStart(4, "0")}`,
            frequency: "manual",
            jitterMinutes: 0,
            keywordId,
            timezone: "UTC",
          })),
        });
        await tx.keywordTag.createMany({
          data: keywordIds.slice(0, TARGETS_PER_GROUP).map((keywordId, index) => ({
            id: `${prefix}-keyword-tag-${index + 1}`,
            keywordId,
            tagId,
          })),
        });
        await tx.rankCheck.createMany({
          data: fixtureTargets.flatMap((target, index) => {
            if (index >= TARGETS_PER_GROUP) {
              const id = `${target.id}-failed-check`;
              checkIds.push(id);
              return {
                checkedAt: new Date("2026-09-05T08:00:00.000Z"),
                id,
                keywordId: target.id,
                provider: "e2e-fake",
                publicId: exactPublicId("check", prefix, index),
                status: "failed",
                trigger: "manual",
              };
            }
            const previousId = `${target.id}-previous-check`;
            const currentId = `${target.id}-current-check`;
            checkIds.push(previousId, currentId);
            return [
              {
                checkedAt: new Date("2026-09-04T08:00:00.000Z"),
                id: previousId,
                keywordId: target.id,
                normalizationVersion: "v1",
                position: 8,
                provider: "e2e-fake",
                publicId: exactPublicId("check", prefix, GROUPED_TARGET_COUNT + index * 2),
                rankingUrl: `https://example.org/${target.id}/previous`,
                raw: metricRaw,
                requestedDepth: 100,
                status: "completed",
                trigger: "manual",
              },
              {
                checkedAt: new Date("2026-09-05T08:00:00.000Z"),
                id: currentId,
                keywordId: target.id,
                normalizationVersion: "v1",
                position: 2,
                provider: "e2e-fake",
                publicId: exactPublicId("check", prefix, GROUPED_TARGET_COUNT + index * 2 + 1),
                rankingUrl: `https://example.org/${target.id}/current`,
                raw: metricRaw,
                requestedDepth: 100,
                status: "completed",
                trigger: "manual",
              },
            ];
          }),
        });
        const targetCount = await tx.keyword.count({
          where: { id: { in: keywordIds }, projectId: project.id },
        });
        assert.equal(targetCount, GROUPED_TARGET_COUNT);
        return {
          checkIds,
          filterKeyword,
          keywordIds,
          locationIds,
          locationKey,
          marketIds,
          scheduleId,
          tagId,
          targetCount,
        };
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    await prisma.$disconnect();
    cachedPrisma = null;
    throw error;
  }
}

export async function cleanupRankTrackerGroupedServerFixture(
  fixture: RankTrackerGroupedServerFixture,
) {
  const prisma = e2ePrisma();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.rankCheck.deleteMany({ where: { id: { in: fixture.checkIds } } });
      await tx.keywordTag.deleteMany({ where: { keywordId: { in: fixture.keywordIds } } });
      await tx.keywordSchedule.deleteMany({ where: { keywordId: { in: fixture.keywordIds } } });
      await tx.keyword.deleteMany({ where: { id: { in: fixture.keywordIds } } });
      await tx.checkSchedule.deleteMany({ where: { id: fixture.scheduleId } });
      await tx.tag.deleteMany({ where: { id: fixture.tagId } });
      await tx.projectMarket.deleteMany({ where: { id: { in: fixture.marketIds } } });
      await tx.location.deleteMany({ where: { id: { in: fixture.locationIds } } });
    });
    const [checks, keywords, schedule, tag, markets] = await Promise.all([
      prisma.rankCheck.count({ where: { id: { in: fixture.checkIds } } }),
      prisma.keyword.count({ where: { id: { in: fixture.keywordIds } } }),
      prisma.checkSchedule.count({ where: { id: fixture.scheduleId } }),
      prisma.tag.count({ where: { id: fixture.tagId } }),
      prisma.projectMarket.count({ where: { id: { in: fixture.marketIds } } }),
    ]);
    assert.equal(checks + keywords + schedule + tag + markets, 0);
  } finally {
    await prisma.$disconnect();
    cachedPrisma = null;
  }
}

export function groupedLeafRows(body: Locator, keyword: string) {
  return body.locator('[role="row"][data-depth="1"]').filter({ hasText: keyword });
}
