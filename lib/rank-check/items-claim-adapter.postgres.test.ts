import { randomUUID } from "node:crypto";
import { databasePoolConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RANK_CHECK_ITEM_CLAIM_LEASE_MS } from "./dispatcher-constants";
import { claimDueRankCheckItems } from "./items-claim";

vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: vi.fn(async () => undefined),
}));

function requiredDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for the PostgreSQL claim adapter test.");
  return value;
}

const databaseUrl = requiredDatabaseUrl();
const client = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: databaseUrl, ...databasePoolConfig(undefined, databaseUrl), max: 1 },
    { schema: databaseSchemaFromUrl(databaseUrl) },
  ),
});
const suffix = randomUUID();
const userId = `claim-adapter-user-${suffix}`;
const projectId = `claim-adapter-project-${suffix}`;
const locationId = `claim-adapter-location-${suffix}`;
const runId = `claim-adapter-run-${suffix}`;
const queuedKeywordId = `claim-adapter-queued-keyword-${suffix}`;
const expiredKeywordId = `claim-adapter-expired-keyword-${suffix}`;
const queuedItemId = `claim-adapter-queued-item-${suffix}`;
const expiredItemId = `claim-adapter-expired-item-${suffix}`;

afterEach(async () => {
  await client.auditLog.deleteMany({ where: { projectId } });
  await client.project.deleteMany({ where: { id: projectId } });
  await client.location.deleteMany({ where: { id: locationId } });
  await client.user.deleteMany({ where: { id: userId } });
  await client.$disconnect();
});

describe("expired rank-check claim SQL through PrismaPg", () => {
  it("commits queued and expired claims together with timestamp(3) parameters", async () => {
    const now = new Date("2026-09-04T14:00:00.000Z");
    const originalStart = new Date("2026-09-04T13:00:00.000Z");
    await client.user.create({
      data: {
        email: `claim-adapter-${suffix}@example.com`,
        id: userId,
        name: "Rank claim adapter fixture",
        publicId: makePublicId("usr"),
      },
    });
    await client.project.create({
      data: {
        domain: "example.com",
        id: projectId,
        name: "Rank claim adapter fixture",
        ownerId: userId,
        publicId: makePublicId("prj"),
      },
    });
    await client.location.create({
      data: {
        canonicalKey: `claim-adapter:${suffix}`,
        countryCode: "US",
        displayName: "United States",
        gl: "us",
        hl: "en",
        id: locationId,
        kind: "country",
        languageCode: "en",
        languageLabel: "English",
        primaryGeoName: "United States",
        secondaryGeoName: "United States",
      },
    });
    await client.projectMarket.create({
      data: {
        locationId,
        projectId,
        publicId: makePublicId("pmkt"),
        status: "active",
      },
    });
    await client.keyword.createMany({
      data: [
        {
          id: queuedKeywordId,
          location: "US:en",
          locationId,
          projectId,
          publicId: makePublicId("kw"),
          text: `queued ${suffix}`,
        },
        {
          id: expiredKeywordId,
          location: "US:en",
          locationId,
          projectId,
          publicId: makePublicId("kw"),
          text: `expired ${suffix}`,
        },
      ],
    });
    await client.rankCheckRun.create({
      data: {
        id: runId,
        projectId,
        publicId: makePublicId("rcr"),
        requestedCount: 2,
        selectionHash: `claim-adapter-${suffix}`,
        selectionKind: "scheduled_due",
        selectionSpec: { fixture: "claim-adapter" },
        status: "queued",
        trigger: "scheduled",
      },
    });
    await client.rankCheckRunItem.createMany({
      data: [
        {
          id: queuedItemId,
          keywordId: queuedKeywordId,
          notBefore: now,
          runId,
          status: "queued",
        },
        {
          claimAttempts: 1,
          claimExpiresAt: new Date("2026-09-04T13:59:00.000Z"),
          id: expiredItemId,
          keywordId: expiredKeywordId,
          runId,
          startedAt: originalStart,
          status: "running",
        },
      ],
    });

    const result = await claimDueRankCheckItems({ now }, client as never).catch(async (error) => {
      // Before the repair, PostgreSQL rejects the untyped reclaim CASE and rolls back this queue.
      await expect(
        client.rankCheckRunItem.findUniqueOrThrow({ where: { id: queuedItemId } }),
      ).resolves.toMatchObject({ claimAttempts: 0, status: "queued" });
      throw error;
    });

    expect(result).toMatchObject({
      claimed: 2,
      groups: [
        expect.objectContaining({
          keywordIds: expect.arrayContaining([queuedKeywordId, expiredKeywordId]),
          runItemIds: expect.arrayContaining([queuedItemId, expiredItemId]),
        }),
      ],
    });
    await expect(
      client.rankCheckRunItem.findMany({
        orderBy: { id: "asc" },
        where: { id: { in: [queuedItemId, expiredItemId] } },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        claimAttempts: 2,
        claimExpiresAt: new Date(now.getTime() + RANK_CHECK_ITEM_CLAIM_LEASE_MS),
        id: expiredItemId,
        startedAt: originalStart,
        status: "running",
      }),
      expect.objectContaining({
        claimAttempts: 1,
        claimExpiresAt: new Date(now.getTime() + RANK_CHECK_ITEM_CLAIM_LEASE_MS),
        id: queuedItemId,
        startedAt: now,
        status: "running",
      }),
    ]);
    await expect(
      client.auditLog.findFirstOrThrow({
        where: { action: "rank_check_run.item_reclaimed", projectId },
      }),
    ).resolves.toMatchObject({ after: expect.objectContaining({ reason: "lease_expired" }) });
  });
});
