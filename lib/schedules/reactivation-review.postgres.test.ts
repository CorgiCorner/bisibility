import type { Actor } from "@/lib/auth/authorize";
import { type Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { seedReviewProject } from "./review-permit.postgres-fixture";

const state = vi.hoisted(() => ({
  db: undefined as PrismaClient | undefined,
  actor: { id: "", memberships: [] } as Actor,
  projectId: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/actions/_shared", async (original) => ({
  ...(await original<typeof import("@/lib/actions/_shared")>()),
  getActionActor: async () => state.actor,
  requireProjectScope: async () =>
    ownedDb().project.findUniqueOrThrow({ where: { id: state.projectId } }),
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/analytics/server", () => ({ readAnalyticsSurfaceFromHeaders: async () => null }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_, key) => {
        const db = state.db;
        if (!db) throw new Error("Owned database fixture is not ready.");
        const value = db[key as keyof PrismaClient];
        return typeof value === "function" ? value.bind(db) : value;
      },
    },
  ),
}));
function ownedDb() {
  if (!state.db) throw new Error("Missing owned fixture database.");
  return state.db;
}
beforeAll(() => {
  const url = process.env.DATABASE_URL;
  if (
    !url ||
    ["DIRECT_URL", "PROVIDER_UI_TEST_DATABASE_URL", "AI_TRACKING_TEST_DATABASE_URL"].some(
      (key) => process.env[key] !== url,
    )
  )
    throw new Error("All four owned fixture URLs are required.");
  const parsed = new URL(url);
  if (
    parsed.hostname !== "127.0.0.1" ||
    !["/credits_fixture", "/cadence_fixture"].includes(parsed.pathname) ||
    ["55441", "55447", "55448"].includes(parsed.port)
  )
    throw new Error("Owned fixture connection required.");
  state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
});
afterAll(async () => {
  await state.db?.$disconnect();
});

import { addKeywordsMatrix } from "@/lib/actions/keyword";
import {
  restoreProjectMarketFromProject,
  setProjectMarketEnabled,
} from "@/lib/actions/project-market-lifecycle";
import { addProjectMarkets } from "@/lib/actions/project-markets";
import { makePublicId } from "@/lib/db/public-id";
import { keywordCreateChange } from "./keyword-create-change";
import { setScheduleState } from "./mutations";
import { previewScheduleChange } from "./preview";

function submission(p: Awaited<ReturnType<typeof previewScheduleChange>>) {
  if (!p.preview_token) throw new Error("Expected signed review");
  return {
    preview_token: p.preview_token,
    expected_revision: p.expected_revision,
    window_start: p.window_start,
  };
}
async function rollbackProof(
  projectId: string,
  table: "keywords" | "project_markets",
  run: () => Promise<unknown>,
) {
  const db = ownedDb();
  const name = `reject_review_${projectId.replaceAll("-", "")}`;
  await db.$executeRawUnsafe(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Review rollback proof'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER ${name} BEFORE UPDATE ON ${table} FOR EACH ROW WHEN (NEW."projectId" = '${projectId}') EXECUTE FUNCTION ${name}()`,
  );
  try {
    await expect(run()).rejects.toThrow("Review rollback proof");
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON ${table}`);
    await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
  }
  expect(await db.scheduleReviewReceipt.count({ where: { projectId } })).toBe(0);
}
async function setup() {
  const db = ownedDb();
  const seed = await seedReviewProject(db);
  state.actor = seed.actor;
  state.projectId = seed.projectId;
  const keyword = await db.keyword.findFirstOrThrow({
    where: { projectId: seed.projectId },
    include: { locationRef: true },
  });
  const market = await db.projectMarket.create({
    data: {
      projectId: seed.projectId,
      locationId: keyword.locationId,
      name: "Market",
      status: "paused",
      publicId: makePublicId("pmkt"),
    },
  });
  return { db, ...seed, keyword, market };
}

it.each(["paused", "weekly"] as const)(
  "archive %s to deeper daily refuses without a receipt",
  async (frequency) => {
    const s = await setup();
    await s.db.projectMarket.update({ where: { id: s.market.id }, data: { status: "active" } });
    await s.db.checkSchedule.update({
      where: { publicId: s.schedulePublicId },
      data: { enabled: frequency !== "paused", frequency, serpDepth: 10 },
    });
    const destination = await s.db.checkSchedule.create({
      data: {
        projectId: s.projectId,
        name: "Daily",
        publicId: makePublicId("sch"),
        frequency: "daily",
        enabled: true,
        serpDepth: 100,
        providerPolicy: "dataforseo",
      },
    });
    const command = { kind: "rank" as const, destinationScheduleId: destination.publicId };
    const change = {
      op: "state" as const,
      id: s.schedulePublicId,
      state: "archived" as const,
      command,
    };
    const preview = await previewScheduleChange(s.projectId, s.actor, change);
    expect(preview.requires_review).toBe(true);
    await expect(
      setScheduleState(s.projectId, s.actor, s.schedulePublicId, "archived", command, {
        gate: true,
      }),
    ).rejects.toMatchObject({ code: "schedule_review_required" });
    expect(
      (await s.db.keyword.findUniqueOrThrow({ where: { id: s.keyword.id } })).checkScheduleId,
    ).toBe(s.keyword.checkScheduleId);
    expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(0);
    const run = (review: ReturnType<typeof submission>) =>
      setScheduleState(s.projectId, s.actor, s.schedulePublicId, "archived", command, {
        gate: true,
        review,
      });
    const review = submission(preview);
    await rollbackProof(s.projectId, "keywords", () => run(review));
    expect(
      (await s.db.keyword.findUniqueOrThrow({ where: { id: s.keyword.id } })).checkScheduleId,
    ).toBe(s.keyword.checkScheduleId);
    await s.db.checkSchedule.update({ where: { id: destination.id }, data: { serpDepth: 50 } });
    await expect(run(review)).rejects.toMatchObject({ code: "schedule_review_stale" });
    const fresh = submission(await previewScheduleChange(s.projectId, s.actor, change));
    expect(await run(fresh)).toMatchObject({ changed: true });
    expect(
      (await s.db.keyword.findUniqueOrThrow({ where: { id: s.keyword.id } })).checkScheduleId,
    ).toBe(destination.id);
    expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(1);
    await expect(run(fresh)).rejects.toMatchObject({ code: "schedule_review_stale" });
  },
  60000,
);

it.each([
  [20, null],
  [20, "project"],
  [100, null],
  [100, "project"],
] as const)(
  "archive unknown-price inherited depth to explicit %s with policy %s",
  async (depth, providerPolicy) => {
    const s = await setup();
    await s.db.projectMarket.update({ where: { id: s.market.id }, data: { status: "active" } });
    await s.db.checkSchedule.update({
      where: { publicId: s.schedulePublicId },
      data: { frequency: "daily", serpDepth: null, providerPolicy: null },
    });
    const destination = await s.db.checkSchedule.create({
      data: {
        projectId: s.projectId,
        publicId: makePublicId("sch"),
        name: "Daily",
        frequency: "daily",
        enabled: true,
        serpDepth: depth,
        providerPolicy,
      },
    });
    const command = { kind: "rank" as const, destinationScheduleId: destination.publicId };
    const change = {
      op: "state" as const,
      id: s.schedulePublicId,
      state: "archived" as const,
      command,
    };
    const preview = await previewScheduleChange(s.projectId, s.actor, change);
    expect(preview.cost_before_cents).toBeNull();
    expect(preview.cost_after_cents).toBeNull();
    const run = (review?: ReturnType<typeof submission>) =>
      setScheduleState(s.projectId, s.actor, s.schedulePublicId, "archived", command, {
        gate: true,
        review,
      });
    if (depth === 100) {
      expect(preview.requires_review).toBe(true);
      expect(preview.review_reasons).toContain("price_unknown");
      await expect(run()).rejects.toMatchObject({ code: "schedule_review_required" });
      const review = submission(preview);
      await s.db.projectDefaults.update({
        where: { projectId: s.projectId },
        data: { serpDepth: 10 },
      });
      await expect(run(review)).rejects.toMatchObject({ code: "schedule_review_stale" });
      expect(
        (await s.db.keyword.findUniqueOrThrow({ where: { id: s.keyword.id } })).checkScheduleId,
      ).toBe(s.keyword.checkScheduleId);
    } else {
      await expect(run()).resolves.toMatchObject({ changed: true });
      expect(preview.requires_review).toBe(false);
      expect(preview.review_reasons).toEqual([]);
      expect(
        (await s.db.keyword.findUniqueOrThrow({ where: { id: s.keyword.id } })).checkScheduleId,
      ).toBe(destination.id);
      expect(
        (await s.db.checkSchedule.findUniqueOrThrow({ where: { publicId: s.schedulePublicId } }))
          .archivedAt,
      ).not.toBeNull();
    }
    expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(0);
  },
  60000,
);

it.each(["resume", "restore"] as const)(
  "market %s refuses retained recurring spend",
  async (mode) => {
    const s = await setup();
    if (mode === "restore")
      await s.db.projectMarket.update({ where: { id: s.market.id }, data: { status: "removed" } });
    const input = { projectId: s.projectPublicId, marketId: s.market.publicId };
    const result =
      mode === "resume"
        ? await setProjectMarketEnabled({ ...input, enabled: true })
        : await restoreProjectMarketFromProject(input);
    expect(result).toMatchObject({
      ok: false,
      error: { status: 428, preview: { requires_review: true } },
    });
    expect(
      (await s.db.projectMarket.findUniqueOrThrow({ where: { id: s.market.id } })).status,
    ).toBe(mode === "resume" ? "paused" : "removed");
    expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(0);
    const change = { op: "market-reactivate" as const, marketIds: [s.market.publicId], mode };
    const preview = await previewScheduleChange(s.projectId, s.actor, change);
    const review = submission(preview);
    const run = (review: ReturnType<typeof submission>) =>
      mode === "resume"
        ? setProjectMarketEnabled({ ...input, enabled: true, review })
        : restoreProjectMarketFromProject({ ...input, review });
    await rollbackProof(s.projectId, "project_markets", () => run(review));
    await s.db.checkSchedule.update({
      where: { publicId: s.schedulePublicId },
      data: { serpDepth: 100 },
    });
    expect(await run(review)).toMatchObject({ ok: false, error: { status: 409 } });
    const fresh = submission(await previewScheduleChange(s.projectId, s.actor, change));
    expect(await run(fresh)).toMatchObject(
      mode === "resume" ? { status: "active" } : { resumedKeywords: 1 },
    );
    expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(1);
    await expect(run(fresh)).rejects.toThrow();
  },
  60000,
);

it.each([100, null] as const)(
  "restored omitted depth prices assigned depth %s instead of the legacy depth",
  async (depth) => {
    const s = await setup();
    await s.db.projectMarket.update({ where: { id: s.market.id }, data: { status: "active" } });
    await s.db.checkSchedule.update({
      where: { publicId: s.schedulePublicId },
      data: { serpDepth: depth },
    });
    await s.db.keywordSchedule.create({
      data: { keywordId: s.keyword.id, frequency: "manual", serpDepth: 10, timezone: "UTC" },
    });
    await s.db.keyword.update({ where: { id: s.keyword.id }, data: { archivedAt: new Date() } });
    const location = await s.db.location.upsert({
      where: { canonicalKey: "US" },
      create: { ...s.keyword.locationRef, id: crypto.randomUUID(), canonicalKey: "US" },
      update: {},
    });
    await s.db.keyword.update({ where: { id: s.keyword.id }, data: { locationId: location.id } });
    await s.db.projectMarket.update({
      where: { id: s.market.id },
      data: { locationId: location.id },
    });
    await s.db.providerConnection.create({
      data: {
        projectId: s.projectId,
        publicId: makePublicId("conn"),
        kind: "serp",
        provider: "dataforseo",
        status: "connected",
      },
    });
    const input = {
      projectId: s.projectPublicId,
      keywords: [s.keyword.text],
      devices: ["desktop" as const],
      locations: [{ locationKey: "US" }],
      tags: [],
      schedule: {
        frequency: "daily" as const,
        timezone: "UTC",
        jitterMinutes: 60,
        cronExpression: null,
      },
    };
    const change = keywordCreateChange(input);
    const omitted = await previewScheduleChange(s.projectId, s.actor, change);
    const explicit = await previewScheduleChange(
      s.projectId,
      s.actor,
      keywordCreateChange({ ...input, schedule: { ...input.schedule, serpDepth: depth } }),
    );
    expect(omitted.cost_after_cents).toBe(explicit.cost_after_cents);
    const result = await addKeywordsMatrix({
      ...input,
      review: {
        preview_token: omitted.preview_token,
        expected_revision: omitted.expected_revision,
        window_start: omitted.window_start,
      },
    });
    expect(result).toMatchObject({ created: 0 });
    expect(
      (
        await s.db.keyword.findUniqueOrThrow({
          where: { id: s.keyword.id },
          include: { checkSchedule: true },
        })
      ).checkSchedule?.serpDepth,
    ).toBe(depth);
  },
  60000,
);

it("re-adding a paused market refuses retained recurring spend", async () => {
  const s = await setup();
  const location = await s.db.location.upsert({
    where: { canonicalKey: "US" },
    create: { ...s.keyword.locationRef, id: crypto.randomUUID(), canonicalKey: "US" },
    update: {},
  });
  await s.db.keyword.update({ where: { id: s.keyword.id }, data: { locationId: location.id } });
  await s.db.projectMarket.update({
    where: { id: s.market.id },
    data: { locationId: location.id },
  });
  const input = {
    projectId: s.projectPublicId,
    choices: [
      { canonicalKey: "US", countryCode: "US", languageCode: "en", kind: "country" as const },
    ],
  };
  expect(await addProjectMarkets(input)).toMatchObject({ ok: false, error: { status: 428 } });
  expect((await s.db.projectMarket.findUniqueOrThrow({ where: { id: s.market.id } })).status).toBe(
    "paused",
  );
  const change = {
    op: "market-reactivate" as const,
    marketIds: [s.market.publicId],
    mode: "add" as const,
  };
  const review = submission(await previewScheduleChange(s.projectId, s.actor, change));
  await rollbackProof(s.projectId, "project_markets", () =>
    addProjectMarkets({ ...input, review }),
  );
  expect(await addProjectMarkets({ ...input, review })).toMatchObject({ ok: true });
  expect((await s.db.projectMarket.findUniqueOrThrow({ where: { id: s.market.id } })).status).toBe(
    "active",
  );
  expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(1);
  expect(await addProjectMarkets({ ...input, review })).toMatchObject({
    ok: false,
    error: { status: 409 },
  });
}, 60000);

it.each(["manual", "paused", "monthly", "weekly"] as const)(
  "production cadence %s remains review-free without an admission",
  async (frequency) => {
    const s = await setup();
    const { setKeywordCadence } = await import("@/lib/rank-check/schedules/keyword-cadence");
    const { normalizeSchedule } = await import("@/lib/actions/_schedule");
    await s.db.$transaction((tx) =>
      setKeywordCadence(
        tx,
        s.projectId,
        [s.keyword.id],
        normalizeSchedule({ frequency, timezone: "UTC", jitterMinutes: 60, cronExpression: null }),
        s.userId,
        "schedule",
      ),
    );
    expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(0);
  },
  60000,
);

it.each(["manual", "paused"] as const)(
  "market %s retention reactivates without review or a receipt",
  async (frequency) => {
    const s = await setup();
    await s.db.checkSchedule.update({
      where: { publicId: s.schedulePublicId },
      data: { frequency, enabled: false },
    });
    expect(
      await setProjectMarketEnabled({
        projectId: s.projectPublicId,
        marketId: s.market.publicId,
        enabled: true,
      }),
    ).toEqual({ status: "active" });
    expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(0);
  },
  60000,
);
it.each(["manual", "paused", "monthly", "weekly"] as const)(
  "archive to %s remains review-free when spend does not increase",
  async (frequency) => {
    const s = await setup();
    await s.db.projectMarket.update({ where: { id: s.market.id }, data: { status: "active" } });
    const destination =
      frequency === "manual"
        ? null
        : await s.db.checkSchedule.create({
            data: {
              projectId: s.projectId,
              name: "Destination",
              publicId: makePublicId("sch"),
              frequency,
              enabled: frequency !== "paused",
              providerPolicy: "dataforseo",
            },
          });
    const command = { kind: "rank" as const, destinationScheduleId: destination?.publicId ?? null };
    const change = {
      op: "state" as const,
      id: s.schedulePublicId,
      state: "archived" as const,
      command,
    };
    expect((await previewScheduleChange(s.projectId, s.actor, change)).requires_review).toBe(false);
    expect(
      await setScheduleState(s.projectId, s.actor, s.schedulePublicId, "archived", command, {
        gate: true,
      }),
    ).toMatchObject({ changed: true });
    expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(0);
  },
  60000,
);

it("verifies resolved depth after inheritance inside the admitted transaction", async () => {
  const s = await setup();
  const { commitKeywordCreate } = await import("./keyword-create-write");
  const { setKeywordCadence } = await import("@/lib/rank-check/schedules/keyword-cadence");
  const { normalizeSchedule } = await import("@/lib/actions/_schedule");
  const location = await s.db.location.upsert({
    where: { canonicalKey: "US" },
    create: { ...s.keyword.locationRef, id: crypto.randomUUID(), canonicalKey: "US" },
    update: {},
  });
  const cadence = normalizeSchedule({
    frequency: "daily",
    cronExpression: null,
    timezone: "UTC",
    jitterMinutes: 60,
  });
  const change = keywordCreateChange({
    projectId: s.projectPublicId,
    keywords: ["changed inherited depth"],
    locationKey: "US",
    tags: [],
    device: "desktop",
    schedule: cadence,
  });
  const review = submission(await previewScheduleChange(s.projectId, s.actor, change));
  await expect(
    commitKeywordCreate(s.projectId, s.actor, change, review, async (tx, admission) => {
      const keyword = await tx.keyword.create({
        data: {
          publicId: makePublicId("kw"),
          projectId: s.projectId,
          locationId: location.id,
          location: "United States",
          text: "changed inherited depth",
          device: "desktop",
        },
      });
      await tx.keywordSchedule.create({
        data: { keywordId: keyword.id, frequency: "manual", timezone: "UTC", serpDepth: 100 },
      });
      await setKeywordCadence(
        tx,
        s.projectId,
        [keyword.id],
        cadence,
        s.userId,
        "schedule",
        admission,
      );
    }),
  ).rejects.toMatchObject({ code: "schedule_review_stale" });
  expect(
    await s.db.keyword.count({
      where: { projectId: s.projectId, text: "changed inherited depth" },
    }),
  ).toBe(0);
  expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(0);
}, 60000);

it("rechecks newly retained re-add markets in the status transaction", async () => {
  const s = await setup();
  const location = await s.db.location.upsert({
    where: { canonicalKey: "US" },
    create: { ...s.keyword.locationRef, id: crypto.randomUUID(), canonicalKey: "US" },
    update: {},
  });
  await s.db.keyword.update({ where: { id: s.keyword.id }, data: { locationId: location.id } });
  await s.db.projectMarket.delete({ where: { id: s.market.id } });
  const original = s.db.projectMarket.findMany.bind(s.db.projectMarket);
  let inserted = false;
  const spy = vi.spyOn(s.db.projectMarket, "findMany").mockImplementation((async (
    args: Parameters<typeof original>[0],
  ) => {
    const rows = await original(args);
    if (!inserted && args?.where?.locationId) {
      inserted = true;
      await s.db.projectMarket.create({
        data: {
          projectId: s.projectId,
          locationId: location.id,
          publicId: s.market.publicId,
          name: "Concurrent paused market",
          status: "paused",
        },
      });
    }
    return rows;
  }) as typeof s.db.projectMarket.findMany);
  try {
    expect(
      await addProjectMarkets({
        projectId: s.projectPublicId,
        choices: [{ canonicalKey: "US", countryCode: "US", languageCode: "en", kind: "country" }],
      }),
    ).toMatchObject({ ok: false, error: { status: 409 } });
  } finally {
    spy.mockRestore();
  }
  expect(
    (await s.db.projectMarket.findUniqueOrThrow({ where: { publicId: s.market.publicId } })).status,
  ).toBe("paused");
  expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(0);
}, 60000);

it("rechecks the transfer snapshot after token verification before consuming the receipt", async () => {
  const s = await setup();
  await s.db.projectMarket.update({ where: { id: s.market.id }, data: { status: "active" } });
  const destination = await s.db.checkSchedule.create({
    data: {
      projectId: s.projectId,
      publicId: makePublicId("sch"),
      name: "Daily",
      frequency: "daily",
      enabled: true,
      serpDepth: 100,
      providerPolicy: "dataforseo",
    },
  });
  const command = { kind: "rank" as const, destinationScheduleId: destination.publicId };
  const change = {
    op: "state" as const,
    id: s.schedulePublicId,
    state: "archived" as const,
    command,
  };
  const review = submission(await previewScheduleChange(s.projectId, s.actor, change));
  const transaction = s.db.$transaction.bind(s.db);
  const spy = vi.spyOn(s.db, "$transaction").mockImplementationOnce((async (
    callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    options?: { maxWait?: number; timeout?: number },
  ) => {
    await s.db.checkSchedule.update({ where: { id: destination.id }, data: { serpDepth: 50 } });
    return transaction(callback, options);
  }) as typeof s.db.$transaction);
  try {
    await expect(
      setScheduleState(s.projectId, s.actor, s.schedulePublicId, "archived", command, {
        gate: true,
        review,
      }),
    ).rejects.toMatchObject({ code: "schedule_review_stale" });
  } finally {
    spy.mockRestore();
  }
  expect(
    (await s.db.keyword.findUniqueOrThrow({ where: { id: s.keyword.id } })).checkScheduleId,
  ).toBe(s.keyword.checkScheduleId);
  expect(await s.db.scheduleReviewReceipt.count({ where: { projectId: s.projectId } })).toBe(0);
}, 60000);
