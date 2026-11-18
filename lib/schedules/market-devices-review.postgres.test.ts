import type { Actor } from "@/lib/auth/authorize";
import { PrismaClient } from "@/lib/generated/prisma/client";
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

import {
  addProjectMarketDeviceTargets,
  previewProjectMarketDeviceTargets,
} from "@/lib/actions/project-market-devices";
import { makePublicId } from "@/lib/db/public-id";
import { marketDevicesChange } from "@/lib/markets/create-review-change";
import { isScheduleActionFailure } from "./action-result";
import { keywordCreateChange } from "./keyword-create-change";
import { previewScheduleChange } from "./preview";

async function setupDevice(frequency: "weekly" | "paused" = "weekly") {
  const db = ownedDb(),
    seed = await seedReviewProject(db);
  state.actor = seed.actor;
  state.projectId = seed.projectId;
  const source = await db.keyword.findFirstOrThrow({
    where: { projectId: seed.projectId },
    include: { locationRef: true },
  });
  // Use a canonical cached country instead of the seed's deliberately opaque location key.
  const location = await db.location.upsert({
    where: { canonicalKey: "US" },
    create: { ...source.locationRef, id: crypto.randomUUID(), canonicalKey: "US" },
    update: {},
  });
  await db.keyword.update({
    where: { id: source.id },
    data: { locationId: location.id, targetUrl: "/copied", topic: "Topic", intent: "commercial" },
  });
  const market = await db.projectMarket.create({
    data: {
      projectId: seed.projectId,
      locationId: location.id,
      publicId: makePublicId("pmkt"),
      name: "Market",
      status: "active",
    },
  });
  await db.checkSchedule.update({
    where: { publicId: seed.schedulePublicId },
    data: { frequency },
  });
  return { db, ...seed, source, market, location };
}
async function counts(projectId: string) {
  const db = ownedDb(),
    where = { projectId };
  return [
    await db.projectMarket.count({ where }),
    await db.checkSchedule.count({ where }),
    await db.keyword.count({ where }),
    await db.keywordSchedule.count({ where: { keyword: where } }),
    await db.scheduleReviewReceipt.count({ where }),
    await db.auditLog.count({ where }),
  ];
}
it("device increase: refuses atomically, quotes the same tuples, confirms once, rejects different sets/replay and rolls receipt back", async () => {
  const seed = await setupDevice();
  const input = {
    projectId: seed.projectPublicId,
    marketId: seed.market.publicId,
    device: "mobile" as const,
    scheduleId: seed.schedulePublicId,
  };
  const fingerprint = await previewProjectMarketDeviceTargets(input);
  if (fingerprint.outcome !== "ready") throw new Error("Missing scope");
  const raw = { ...input, fingerprint: fingerprint.fingerprint },
    before = await counts(seed.projectId);
  const refused = await addProjectMarketDeviceTargets(raw);
  expect(refused).toMatchObject({
    ok: false,
    error: { status: 428, preview: { requires_review: true } },
  });
  expect(await counts(seed.projectId)).toEqual(before);
  if (!isScheduleActionFailure(refused) || !refused.error.preview)
    throw new Error("Missing preview");
  const p = refused.error.preview;
  if (!p.preview_token) throw new Error("Expected signed preview");
  const review = {
    preview_token: p.preview_token,
    expected_revision: p.expected_revision,
    window_start: p.window_start,
  };
  const plain = await previewScheduleChange(
    seed.projectId,
    seed.actor,
    keywordCreateChange({
      projectId: seed.projectPublicId,
      keywords: [seed.source.text],
      devices: ["mobile"],
      locations: [{ locationKey: "US" }],
      tags: [],
      checkScheduleId: seed.schedulePublicId,
    }),
  );
  expect(p.cost_after_cents).toBe(plain.cost_after_cents);
  expect(await addProjectMarketDeviceTargets({ ...raw, keywordIds: [], review })).toMatchObject({
    ok: false,
    error: { status: 409 },
  });
  expect(await counts(seed.projectId)).toEqual(before);
  // A real database trigger proves that keyword and receipt writes share one transaction.
  await seed.db.$executeRawUnsafe(
    `CREATE FUNCTION reject_device_${seed.projectId.replaceAll("-", "")}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Device rollback proof'; END $$`,
  );
  const fn = `reject_device_${seed.projectId.replaceAll("-", "")}`;
  await seed.db.$executeRawUnsafe(
    `CREATE TRIGGER device_rollback BEFORE INSERT ON keywords FOR EACH ROW WHEN (NEW."projectId" = '${seed.projectId}' AND NEW.device = 'mobile') EXECUTE FUNCTION ${fn}()`,
  );
  try {
    await expect(addProjectMarketDeviceTargets({ ...raw, review })).rejects.toThrow(
      "Device rollback proof",
    );
  } finally {
    await seed.db.$executeRawUnsafe("DROP TRIGGER device_rollback ON keywords");
    await seed.db.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
  }
  expect(await counts(seed.projectId)).toEqual(before);
  expect(await addProjectMarketDeviceTargets({ ...raw, review })).toEqual({
    outcome: "created",
    created: 1,
  });
  expect(await seed.db.scheduleReviewReceipt.count({ where: { projectId: seed.projectId } })).toBe(
    1,
  );
  const created = await seed.db.keyword.findFirstOrThrow({
    where: { projectId: seed.projectId, device: "mobile" },
    include: { schedule: true },
  });
  expect(created).toMatchObject({
    targetUrl: "/copied",
    topic: "Topic",
    intent: "commercial",
    schedule: { frequency: "weekly" },
  });
  const committed = await counts(seed.projectId);
  expect(await addProjectMarketDeviceTargets({ ...raw, review })).toMatchObject({
    ok: false,
    error: { status: 409 },
  });
  expect(await counts(seed.projectId)).toEqual(committed);
}, 60000);
it.each(["manual", "paused", "duplicate"] as const)(
  "device %s creates no recurring increase or receipt",
  async (mode) => {
    const seed = await setupDevice(mode === "paused" ? "paused" : "weekly");
    if (mode === "duplicate")
      await seed.db.keyword.create({
        data: {
          publicId: makePublicId("kw"),
          projectId: seed.projectId,
          locationId: seed.location.id,
          location: "United States",
          text: seed.source.text,
          device: "mobile",
        },
      });
    const input = {
      projectId: seed.projectPublicId,
      marketId: seed.market.publicId,
      device: "mobile" as const,
      scheduleId: mode === "manual" ? null : seed.schedulePublicId,
    };
    const p = await previewScheduleChange(seed.projectId, seed.actor, marketDevicesChange(input));
    expect(p.requires_review).toBe(false);
    const scope = await previewProjectMarketDeviceTargets(input);
    if (scope.outcome !== "ready") throw new Error("Missing scope");
    expect(
      await addProjectMarketDeviceTargets({ ...input, fingerprint: scope.fingerprint }),
    ).toEqual({ outcome: "created", created: mode === "duplicate" ? 0 : 1 });
    expect(
      await seed.db.scheduleReviewReceipt.count({ where: { projectId: seed.projectId } }),
    ).toBe(0);
  },
  60000,
);
it("device source metadata changes make a signed preview stale", async () => {
  const seed = await setupDevice();
  const input = {
    projectId: seed.projectPublicId,
    marketId: seed.market.publicId,
    device: "mobile" as const,
    scheduleId: seed.schedulePublicId,
  };
  const p = await previewScheduleChange(seed.projectId, seed.actor, marketDevicesChange(input));
  if (!p.preview_token) throw new Error("Expected signed preview");
  const scope = await previewProjectMarketDeviceTargets(input);
  if (scope.outcome !== "ready") throw new Error("Missing scope");
  await seed.db.keyword.update({ where: { id: seed.source.id }, data: { targetUrl: "/changed" } });
  const before = await counts(seed.projectId);
  expect(
    await addProjectMarketDeviceTargets({
      ...input,
      fingerprint: scope.fingerprint,
      review: {
        preview_token: p.preview_token,
        expected_revision: p.expected_revision,
        window_start: p.window_start,
      },
    }),
  ).toMatchObject({ ok: false, error: { status: 409, preview: { requires_review: true } } });
  expect(await counts(seed.projectId)).toEqual(before);
}, 60000);

it("manual device creation retains fingerprint protection for an unsigned transaction admission", async () => {
  const seed = await setupDevice();
  const input = {
    projectId: seed.projectPublicId,
    marketId: seed.market.publicId,
    device: "mobile" as const,
    scheduleId: null,
  };
  const scope = await previewProjectMarketDeviceTargets(input);
  if (scope.outcome !== "ready") throw new Error("Missing scope");
  await seed.db.keyword.update({ where: { id: seed.source.id }, data: { targetUrl: "/changed" } });
  const before = await counts(seed.projectId);
  expect(await addProjectMarketDeviceTargets({ ...input, fingerprint: scope.fingerprint })).toEqual(
    { outcome: "unavailable", reason: "selection_changed" },
  );
  expect(await counts(seed.projectId)).toEqual(before);
}, 60000);
