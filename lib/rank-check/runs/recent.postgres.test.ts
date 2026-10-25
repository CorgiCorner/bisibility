import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dismissRecentRun, readRecentRunOperations } from "./recent";
import { readOperationSnapshot } from "./snapshot";

const now = new Date("2026-10-24T07:00:00Z");
let userId: string;
let projectId: string;
let keywordId: string;
let locationId: string;

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)("UI-7 PostgreSQL recent runs", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, publicId: makePublicId("usr"), name: "Tray" },
    });
    userId = user.id;
    const project = await prisma.project.create({
      data: {
        publicId: makePublicId("prj"),
        ownerId: userId,
        name: "Tray",
        domain: "example.test",
      },
    });
    projectId = project.id;
    const location = await prisma.location.create({
      data: {
        canonicalKey: randomUUID(),
        primaryGeoName: "US",
        secondaryGeoName: "US",
        gl: "us",
        hl: "en",
        countryCode: "US",
        displayName: "US",
        kind: "country",
        languageCode: "en",
        languageLabel: "English",
      },
    });
    locationId = location.id;
    const keyword = await prisma.keyword.create({
      data: { publicId: makePublicId("kw"), projectId, locationId, location: "US", text: "tray" },
    });
    keywordId = keyword.id;
  });
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.location.deleteMany({ where: { id: locationId } });
    await prisma.$disconnect();
  });
  async function run(ageMs = 10_000, data = {}) {
    return prisma.rankCheckRun.create({
      data: {
        projectId,
        publicId: makePublicId("rcr"),
        trigger: "manual",
        selectionKind: "all",
        selectionSpec: {},
        selectionHash: randomUUID(),
        status: "completed",
        outcome: "succeeded",
        finishedAt: new Date(now.getTime() - ageMs),
        ...data,
      },
    });
  }
  it("includes 14:59 but excludes the exact 15:00 boundary, future and deleted runs", async () => {
    const inside = await run(899_000);
    const boundary = await run(900_000);
    const deleted = await run(1000, { deletedAt: now });
    const future = await run(-1000);
    const ids = (await readRecentRunOperations(projectId, userId, now)).map((row) => row.id);
    expect(ids).toContain(inside.publicId);
    expect(ids).not.toContain(boundary.publicId);
    expect(ids).not.toContain(deleted.publicId);
    expect(ids).not.toContain(future.publicId);
  });
  it("excludes recovery-only runs and never uses a later restore as eligibility", async () => {
    const restored = await run();
    await prisma.rankCheck.create({
      data: {
        keywordId,
        publicId: makePublicId("check"),
        provider: "serpapi",
        runId: restored.id,
        checkedAt: now,
        recoveryRestoredAt: now,
      },
    });
    const old = await run(3_600_000);
    await prisma.rankCheck.create({
      data: {
        keywordId,
        publicId: makePublicId("check"),
        provider: "serpapi",
        runId: old.id,
        checkedAt: new Date(now.getTime() - 3_600_000),
        recoveryRestoredAt: now,
      },
    });
    const ids = (await readRecentRunOperations(projectId, userId, now)).map((row) => row.id);
    expect(ids).not.toContain(restored.publicId);
    expect(ids).not.toContain(old.publicId);
  });
  it("persists dismissal across two sessions of one user with original expiry; other users unaffected", async () => {
    const target = await run(5000);
    expect(
      (await readRecentRunOperations(projectId, userId, now)).some(
        (row) => row.id === target.publicId,
      ),
    ).toBe(true);
    expect(await dismissRecentRun(projectId, userId, target.publicId, now)).toEqual({
      dismissed: true,
    });
    expect(
      (await readRecentRunOperations(projectId, userId, now)).some(
        (row) => row.id === target.publicId,
      ),
    ).toBe(false);
    const stored = await prisma.runTrayDismissal.findUniqueOrThrow({
      where: { userId_runId: { userId, runId: target.id } },
    });
    expect(stored.expiresAt.toISOString()).toBe(
      new Date(target.finishedAt!.getTime() + 900_000).toISOString(),
    );
    expect(
      (await readRecentRunOperations(projectId, "another-session-user", now)).some(
        (row) => row.id === target.publicId,
      ),
    ).toBe(true);
    expect(await dismissRecentRun("unreadable-project", userId, target.publicId, now)).toEqual({
      dismissed: false,
    });
  });
  it("ignores an expired dismissal", async () => {
    const target = await run(2000);
    await prisma.runTrayDismissal.create({
      data: {
        runId: target.id,
        userId,
        dismissedAt: new Date(now.getTime() - 1000),
        expiresAt: now,
      },
    });
    expect(
      (await readRecentRunOperations(projectId, userId, now)).some(
        (row) => row.id === target.publicId,
      ),
    ).toBe(true);
  });
  it("keeps its own limit with more than 50 active runs", async () => {
    await prisma.rankCheckRun.createMany({
      data: Array.from({ length: 51 }, () => ({
        projectId,
        publicId: makePublicId("rcr"),
        trigger: "manual",
        selectionKind: "all",
        selectionSpec: {},
        selectionHash: randomUUID(),
        status: "queued",
      })),
    });
    const target = await run(0);
    const recent = await readRecentRunOperations(projectId, userId, now);
    expect(recent.some((row) => row.id === target.publicId)).toBe(true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      const snapshot = await readOperationSnapshot(projectId, userId);
      expect(snapshot.filter((row) => row.kind === "rank_check" && !row.recent)).toHaveLength(50);
      expect(
        snapshot.some(
          (row) => row.id === target.publicId && row.kind === "rank_check" && row.recent,
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("reads recent operations without activation configuration", async () => {
    const row = await run();
    expect(await readRecentRunOperations(projectId, userId, now)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: row.publicId })]),
    );
  });
});
