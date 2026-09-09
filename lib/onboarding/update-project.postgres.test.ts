import { randomUUID } from "node:crypto";
import * as audit from "@/lib/auth/audit";
import { databasePoolConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateUnmeasuredProject } from "./update-project";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname))
  throw new Error("A local DATABASE_URL is required for the onboarding PostgreSQL test.");
const client = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: databaseUrl, ...databasePoolConfig(undefined, databaseUrl), max: 2 },
    { schema: databaseSchemaFromUrl(databaseUrl) },
  ),
});
const suffix = randomUUID();
const projectId = `onboarding-project-${suffix}`;
const actorId = `onboarding-user-${suffix}`;
const locationId = `onboarding-location-${suffix}`;
const input = { actorId, projectId, identity: { domain: "tes.co", name: "tes" } };

beforeEach(async () => {
  await client.user.create({
    data: {
      id: actorId,
      name: "Onboarding test",
      email: `onboarding-${suffix}@example.test`,
      publicId: makePublicId("usr"),
    },
  });
  await client.project.create({
    data: {
      id: projectId,
      ownerId: actorId,
      publicId: makePublicId("prj"),
      domain: "old.com",
      name: "old",
      trackingScope: "city",
    },
  });
  await client.location.create({
    data: {
      id: locationId,
      canonicalKey: `onboarding:${suffix}`,
      kind: "country",
      displayName: "United States",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    },
  });
  for (const [index, targetUrl] of [
    "https://old.com/docs?q=logs#api",
    "https://another.com/path",
    "/docs",
  ].entries()) {
    await client.keyword.create({
      data: {
        id: `${projectId}-${index}`,
        projectId,
        locationId,
        location: "US:en",
        publicId: makePublicId("kw"),
        text: `onboarding keyword ${index}`,
        targetUrl,
      },
    });
  }
  for (const provider of ["gsc", "dataforseo"])
    await client.providerConnection.create({
      data: {
        projectId,
        provider,
        kind: provider === "gsc" ? "analytics" : "serp",
        publicId: makePublicId("conn"),
        status: "connected",
      },
    });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await client.project.deleteMany({ where: { id: projectId } });
  await client.location.deleteMany({ where: { id: locationId } });
  await client.user.deleteMany({ where: { id: actorId } });
});
afterAll(() => client.$disconnect());

describe("onboarding domain correction in PostgreSQL", () => {
  it("updates imported keywords without checks, preserves other targets and SERP, and audits before/after", async () => {
    expect(await updateUnmeasuredProject(input, client)).toMatchObject({
      ok: true,
      project: { domain: "tes.co", name: "tes" },
    });
    expect(await client.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({
      domain: "tes.co",
      name: "tes",
      trackingScope: "city",
    });
    const keywords = await client.keyword.findMany({
      where: { projectId },
      orderBy: { id: "asc" },
    });
    expect(keywords.map((k) => k.targetUrl)).toEqual([
      "https://tes.co/docs?q=logs#api",
      "https://another.com/path",
      "/docs",
    ]);
    expect(
      (await client.providerConnection.findMany({ where: { projectId } })).map((c) => c.provider),
    ).toEqual(["dataforseo"]);
    const log = await client.auditLog.findFirstOrThrow({
      where: { projectId, action: "onboarding.project_website.update" },
    });
    expect(log.before).toEqual({ domain: "old.com", name: "old", gscConnected: true });
    expect(log.after).toEqual({
      domain: "tes.co",
      name: "tes",
      gscConnected: false,
      rewrittenKeywords: 1,
    });
  });
  it.each(["completed", "running", "failed", "deferred"])(
    "rejects with one %s RankCheck, without any side effects",
    async (status) => {
      await client.rankCheck.create({
        data: {
          keywordId: `${projectId}-0`,
          publicId: makePublicId("check"),
          provider: "dataforseo",
          checkedAt: new Date("2026-09-04T12:00:00Z"),
          status,
        },
      });
      expect(await updateUnmeasuredProject(input, client)).toMatchObject({
        ok: false,
        error: { code: "PROJECT_HAS_RANK_CHECKS" },
        project: { domain: "old.com", trackingStartedAt: "2026-09-04T12:00:00.000Z" },
      });
      expect((await client.project.findUniqueOrThrow({ where: { id: projectId } })).domain).toBe(
        "old.com",
      );
      expect(
        (await client.keyword.findUniqueOrThrow({ where: { id: `${projectId}-0` } })).targetUrl,
      ).toBe("https://old.com/docs?q=logs#api");
      expect(await client.providerConnection.count({ where: { projectId } })).toBe(2);
      expect(await client.auditLog.count({ where: { projectId } })).toBe(0);
    },
  );
  it("rolls all mutations back if the project audit cannot be written", async () => {
    const original = audit.writeAudit;
    vi.spyOn(audit, "writeAudit").mockImplementation(async (entry, tx) => {
      if (entry.action === "onboarding.project_website.update")
        throw new Error("Audit unavailable");
      return original(entry, tx);
    });
    await expect(updateUnmeasuredProject(input, client)).rejects.toThrow("Audit unavailable");
    expect((await client.project.findUniqueOrThrow({ where: { id: projectId } })).domain).toBe(
      "old.com",
    );
    expect(
      (await client.keyword.findUniqueOrThrow({ where: { id: `${projectId}-0` } })).targetUrl,
    ).toBe("https://old.com/docs?q=logs#api");
    expect(await client.providerConnection.count({ where: { projectId } })).toBe(2);
    expect(await client.auditLog.count({ where: { projectId } })).toBe(0);
  });
});
