import { addKeywords } from "@/lib/actions/keyword";
import { createKeywordBatchSet } from "@/lib/actions/keyword-batch";
import type { Actor } from "@/lib/auth/authorize";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { createProjectMarket } from "@/lib/markets/create";
import { seedReviewProject } from "@/lib/schedules/review-permit.postgres-fixture";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { archiveSchedule } from "./archive";

const state = vi.hoisted(() => ({
  db: undefined as PrismaClient | undefined,
  actor: { id: "", memberships: [] } as Actor,
  projectId: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_, key) => {
        const db = ownedDb();
        const value = db[key as keyof PrismaClient];
        return typeof value === "function" ? value.bind(db) : value;
      },
    },
  ),
}));
vi.mock("@/lib/actions/_shared", async (original) => ({
  ...(await original<typeof import("@/lib/actions/_shared")>()),
  getActionActor: async () => state.actor,
  requireProjectScope: async () =>
    ownedDb().project.findUniqueOrThrow({
      where: { id: state.projectId },
    }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ user: { id: state.actor.id } }),
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("@/lib/analytics/server", () => ({ readAnalyticsSurfaceFromHeaders: async () => null }));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function ownedDb() {
  if (!state.db) throw new Error("Missing owned fixture database.");
  return state.db;
}

function ownedFixtureUrl(environment: NodeJS.ProcessEnv) {
  const url = environment.DATABASE_URL;
  if (
    !url ||
    ["DIRECT_URL", "PROVIDER_UI_TEST_DATABASE_URL", "AI_TRACKING_TEST_DATABASE_URL"].some(
      (key) => environment[key] !== url,
    )
  )
    throw new Error("All four owned fixture URLs are required.");
  const parsed = new URL(url);
  const roundFixture = parsed.port === "55744" && parsed.pathname === "/w_r1";
  if (
    parsed.hostname !== "127.0.0.1" ||
    (!roundFixture && !["/credits_fixture", "/cadence_fixture"].includes(parsed.pathname)) ||
    [55441, 55447, 55448].includes(Number(parsed.port || 5432))
  )
    throw new Error("Owned fixture connection required.");
  return url;
}

function fixtureEnvironment(url: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: url,
    DIRECT_URL: url,
    PROVIDER_UI_TEST_DATABASE_URL: url,
    AI_TRACKING_TEST_DATABASE_URL: url,
  };
}

describe("owned fixture guard", () => {
  it.each(["credits_fixture", "cadence_fixture"])("accepts a lent %s database", (name) => {
    const url = `postgresql://fixture@127.0.0.1:53125/${name}`;
    expect(ownedFixtureUrl(fixtureEnvironment(url))).toBe(url);
  });

  it("accepts the dedicated round fixture on its assigned port", () => {
    const url = "postgresql://fixture@127.0.0.1:55744/w_r1";
    expect(ownedFixtureUrl(fixtureEnvironment(url))).toBe(url);
  });

  it.each([55441, 55447, 55448])("rejects reserved fixture port %s", (port) => {
    const url = `postgresql://fixture@127.0.0.1:${port}/cadence_fixture`;
    expect(() => ownedFixtureUrl(fixtureEnvironment(url))).toThrow(
      "Owned fixture connection required.",
    );
  });

  it.each([
    "postgresql://fixture@localhost:53125/cadence_fixture",
    "postgresql://fixture@example.com:53125/cadence_fixture",
    "postgresql://fixture@127.0.0.1:53125/postgres",
    "postgresql://fixture@127.0.0.1:53125/w_r1",
    "postgresql://fixture@example.com:55744/w_r1",
  ])("rejects a connection outside the owned loopback databases: %s", (url) => {
    expect(() => ownedFixtureUrl(fixtureEnvironment(url))).toThrow(
      "Owned fixture connection required.",
    );
  });

  it.each(["DIRECT_URL", "PROVIDER_UI_TEST_DATABASE_URL", "AI_TRACKING_TEST_DATABASE_URL"])(
    "rejects a mismatched %s",
    (key) => {
      const environment = fixtureEnvironment(
        "postgresql://fixture@127.0.0.1:53125/cadence_fixture",
      );
      environment[key] = "postgresql://fixture@127.0.0.1:53125/credits_fixture";
      expect(() => ownedFixtureUrl(environment)).toThrow(
        "All four owned fixture URLs are required.",
      );
    },
  );
});

beforeAll(() => {
  const url = ownedFixtureUrl(process.env);
  state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
});
afterAll(async () => {
  await state.db?.$disconnect();
});

let seeded: Awaited<ReturnType<typeof seedReviewProject>>;
beforeEach(async () => {
  seeded = await seedReviewProject(ownedDb());
  state.actor = seeded.actor;
  state.projectId = seeded.projectId;
  await ownedDb().checkSchedule.update({
    where: { publicId: seeded.schedulePublicId },
    data: { isDefault: true },
  });
  await ownedDb().projectDefaults.update({
    where: { projectId: seeded.projectId },
    data: { frequency: "daily", cronExpression: "0 6 * * *" },
  });
});

function marketInput() {
  return {
    projectId: seeded.projectPublicId,
    canonicalKey: "US",
    countryCode: "US",
    languageCode: "en",
    kind: "country",
    devices: ["desktop"],
  };
}

describe("manual creation and legacy default retirement", () => {
  it("creates an empty market without choosing or creating a schedule", async () => {
    const db = ownedDb();
    await db.keyword.updateMany({
      where: { projectId: seeded.projectId },
      data: { checkScheduleId: null },
    });
    await db.checkSchedule.deleteMany({ where: { projectId: seeded.projectId } });
    await createProjectMarket(seeded.userId, seeded.projectId, {
      ...marketInput(),
      method: { kind: "empty" },
    });
    expect(await db.checkSchedule.count({ where: { projectId: seeded.projectId } })).toBe(0);
    expect(await db.projectMarket.count({ where: { projectId: seeded.projectId } })).toBe(1);
    expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(
      0,
    );
  });

  it("creates manual market keywords without using the existing default or consuming a receipt", async () => {
    const db = ownedDb();
    const market = await createProjectMarket(seeded.userId, seeded.projectId, {
      ...marketInput(),
      method: { kind: "paste", text: "manual market term" },
      schedule: { kind: "manual" },
    });
    expect(market.keywordCount).toBe(1);
    const row = await db.keyword.findFirstOrThrow({
      where: { projectId: seeded.projectId, text: "manual market term" },
      include: { schedule: true },
    });
    expect(row.checkScheduleId).toBeNull();
    expect(row.schedule).toMatchObject({ frequency: "manual", nextCheckAt: null });
    expect(await db.checkSchedule.count({ where: { projectId: seeded.projectId } })).toBe(1);
    expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(
      0,
    );
  });

  it("persists omitted keyword cadence as manual despite recurring project and schedule defaults", async () => {
    const db = ownedDb();
    const source = await db.keyword.findFirstOrThrow({ where: { projectId: seeded.projectId } });
    const created = await db.$transaction((tx) =>
      createKeywordBatchSet(tx, seeded.projectId, [
        {
          device: "desktop",
          keyword: "manual keyword term",
          location: "United States",
          locationId: source.locationId,
          schedule: null,
          tags: [],
        },
      ]),
    );
    const row = await db.keyword.findUniqueOrThrow({
      where: { id: created.created[0].id },
      include: { schedule: true },
    });
    expect(row.checkScheduleId).toBeNull();
    expect(row.schedule).toMatchObject({ frequency: "manual", nextCheckAt: null });
    expect(await db.checkSchedule.count({ where: { projectId: seeded.projectId } })).toBe(1);
  });

  it("adds a keyword through the form path with no schedule and leaves it manual", async () => {
    const db = ownedDb();
    const created = await addKeywords({
      keywords: ["form manual term"],
      locationKey: "US",
      projectId: seeded.projectPublicId,
    });
    expect(created).toMatchObject({ created: 1 });
    const row = await db.keyword.findFirstOrThrow({
      where: { projectId: seeded.projectId, text: "form manual term" },
      include: { schedule: true },
    });
    expect(row.checkScheduleId).toBeNull();
    expect(row.schedule).toMatchObject({ frequency: "manual", nextCheckAt: null });
    expect(await db.checkSchedule.count({ where: { projectId: seeded.projectId } })).toBe(1);
  });

  it("archives an old default while preserving the flag and ProjectDefaults", async () => {
    const db = ownedDb();
    const defaultsBefore = await db.projectDefaults.findUniqueOrThrow({
      where: { projectId: seeded.projectId },
    });
    await archiveSchedule(seeded.userId, seeded.projectId, {
      scheduleId: seeded.schedulePublicId,
      destinationScheduleId: null,
    });
    expect(
      await db.checkSchedule.findUniqueOrThrow({ where: { publicId: seeded.schedulePublicId } }),
    ).toMatchObject({ archivedAt: expect.any(Date), enabled: false, isDefault: true });
    expect(
      await db.projectDefaults.findUniqueOrThrow({ where: { projectId: seeded.projectId } }),
    ).toEqual(defaultsBefore);
  });

  it("rejects an archived schedule that is still enabled", async () => {
    const db = ownedDb();
    const before = await db.projectDefaults.findUniqueOrThrow({
      where: { projectId: seeded.projectId },
    });
    await expect(
      db.checkSchedule.update({
        where: { publicId: seeded.schedulePublicId },
        data: { archivedAt: new Date() },
      }),
    ).rejects.toThrow("check_schedules_archived_inactive");
    expect(
      await db.checkSchedule.findUniqueOrThrow({ where: { publicId: seeded.schedulePublicId } }),
    ).toMatchObject({ archivedAt: null, enabled: true, isDefault: true });
    expect(
      await db.projectDefaults.findUniqueOrThrow({ where: { projectId: seeded.projectId } }),
    ).toEqual(before);
  });
});
