import { randomUUID } from "node:crypto";
import { isolatedTrackingDatabase } from "@/lib/ai-tracking/stores/fixtures.postgres-test-support";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { WORKER_INTENT_PENDING_PROBE } from "@/lib/worker-intents/pending-probe";

export function requiredDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for the PostgreSQL evaluation intent test.");
  }
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("PostgreSQL evaluation intent test requires loopback.");
  }
  return value;
}

export async function openEvaluationIntentDatabase() {
  const previous = process.env.AI_TRACKING_TEST_DATABASE_URL;
  process.env.AI_TRACKING_TEST_DATABASE_URL = requiredDatabaseUrl();
  try {
    return await isolatedTrackingDatabase();
  } finally {
    if (previous === undefined) delete process.env.AI_TRACKING_TEST_DATABASE_URL;
    else process.env.AI_TRACKING_TEST_DATABASE_URL = previous;
  }
}

export async function pendingProbe(db: PrismaClient) {
  const [row] = await db.$queryRaw<Array<{ pending: boolean }>>(WORKER_INTENT_PENDING_PROBE);
  return row?.pending ?? false;
}

export async function completedCheck(
  db: PrismaClient,
  trigger: "manual" | "scheduled",
  options: { laterRule?: boolean } = {},
) {
  const suffix = randomUUID();
  const user = await db.user.create({
    data: {
      email: `${suffix}@example.com`,
      name: "Example",
      publicId: makePublicId("usr"),
    },
  });
  const project = await db.project.create({
    data: {
      domain: "example.com",
      name: "Example",
      ownerId: user.id,
      publicId: makePublicId("prj"),
    },
  });
  const location = await db.location.create({
    data: {
      canonicalKey: `example-${suffix}`,
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      kind: "country",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    },
  });
  const keyword = await db.keyword.create({
    data: {
      location: "United States",
      locationId: location.id,
      projectId: project.id,
      publicId: makePublicId("kw"),
      text: "example",
    },
  });
  const rule = await ruleFor(db, project.id, "Earlier drop");
  const laterRule = options.laterRule ? await ruleFor(db, project.id, "Later drop") : null;
  const check = await db.rankCheck.create({
    data: {
      checkedAt: new Date("2026-11-03T12:00:00.000Z"),
      comparisonAllowed: true,
      keywordId: keyword.id,
      normalizationVersion: "v2",
      position: 30,
      previousPosition: 3,
      provider: "mock",
      publicId: makePublicId("check"),
      rankingUrl: "https://example.com/page",
      raw: {},
      requestedDepth: 100,
      status: "completed",
      trigger,
    },
  });
  await db.alertEvaluationIntent.create({ data: { rankCheckId: check.id, state: "pending" } });
  return {
    checkId: check.id,
    keywordId: keyword.id,
    laterRuleId: laterRule?.id ?? "",
    locationId: location.id,
    projectId: project.id,
    ruleId: rule.id,
    userId: user.id,
  };
}

export function rankCheckData(
  keywordId: string,
  checkedAt: Date,
  overrides: { rankingUrl?: string; raw?: object; requestedDepth?: number } = {},
) {
  return {
    checkedAt,
    comparisonAllowed: true,
    keywordId,
    normalizationVersion: "v2",
    position: 30,
    previousPosition: 3,
    provider: "mock",
    publicId: makePublicId("check"),
    rankingUrl: overrides.rankingUrl ?? "https://example.com/page",
    raw: overrides.raw ?? {},
    requestedDepth: overrides.requestedDepth ?? 100,
    status: "completed",
    trigger: "manual",
  };
}

export function ruleFor(
  db: PrismaClient,
  projectId: string,
  name: string,
  extra: {
    conditionType?: "position_drop" | "serp_feature" | "url_mismatch";
    dropPositions?: number | null;
    serpFeature?: string;
  } = {},
) {
  return db.alertRule.create({
    data: {
      channels: ["email"],
      conditionType: extra.conditionType ?? "position_drop",
      dropPositions: extra.dropPositions === undefined ? 5 : extra.dropPositions,
      name,
      projectId,
      publicId: makePublicId("alr"),
      severity: "warning",
      targetType: "all",
      ...(extra.serpFeature ? { serpFeature: extra.serpFeature } : {}),
    },
  });
}

export async function cleanup(
  db: PrismaClient,
  fixture: { locationId: string; projectId: string; userId: string },
) {
  await db.project.delete({ where: { id: fixture.projectId } });
  await db.location.delete({ where: { id: fixture.locationId } });
  await db.user.delete({ where: { id: fixture.userId } });
}
