import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { setScheduleState } from "./mutations";
import { previewScheduleChange } from "./preview";
import { seedReviewProject } from "./review-permit.postgres-fixture";

const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, key) => {
        const db = state.db;
        if (!db) throw new Error("Owned database fixture is not ready.");
        const value = db[key as keyof PrismaClient];
        return typeof value === "function" ? value.bind(db) : value;
      },
    },
  ),
}));

beforeAll(() => {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.DIRECT_URL !== url)
    throw new Error("An owned fixture database is required.");
  const fixture = new URL(url);
  if (
    fixture.hostname !== "127.0.0.1" ||
    !["/w_2_3b", "/credits_fixture", "/cadence_fixture"].includes(fixture.pathname) ||
    ["5440", "55441", "55447", "55448"].includes(fixture.port)
  )
    throw new Error("An owned fixture database is required.");
  state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
});
afterAll(async () => {
  await state.db?.$disconnect();
});

it("rolls back a data sync change with its review receipt and permits a fresh retry", async () => {
  const db = state.db;
  if (!db) throw new Error("Owned database fixture is not ready.");
  const seeded = await seedReviewProject(db);
  const { actor, projectId, projectPublicId } = seeded;
  const project = { where: { id: projectId } };
  const pause = { where: { projectId, kind: "domain_rating" } };
  const audit = { where: { projectId, action: "project.domain_rating.update" } };
  await db.project.update({ ...project, data: { domainRatingEnabled: false } });
  await db.projectSyncPause.create({ data: { projectId, kind: "domain_rating" } });
  const id = `sync:${projectPublicId}:domain_rating`;
  const command = {
    kind: "data_sync",
    publicWrite: true,
    syncKind: "domain_rating",
    projectPublicId,
  } as const;
  const preview = await previewScheduleChange(projectId, actor, {
    op: "state",
    id,
    state: "active",
    command,
  });
  expect(preview.requires_review).toBe(true);
  if (!preview.preview_token) throw new Error("Expected a signed schedule review.");
  const review = {
    preview_token: preview.preview_token,
    expected_revision: preview.expected_revision,
    window_start: preview.window_start,
  };
  await expect(
    setScheduleState(projectId, actor, id, "active", command, {
      atomic: true,
      gate: true,
      review,
      db: {
        $transaction: (run, options) =>
          db.$transaction(async (tx) => {
            await run(tx);
            const inside = await tx.project.findUniqueOrThrow(project);
            expect(inside.domainRatingEnabled).toBe(true);
            expect(await tx.projectSyncPause.count(pause)).toBe(0);
            expect(await tx.auditLog.count(audit)).toBe(1);
            throw new Error("Simulated write rollback");
          }, options),
      },
    }),
  ).rejects.toThrow("Simulated write rollback");
  expect(await db.project.findUniqueOrThrow(project)).toMatchObject({ domainRatingEnabled: false });
  expect(await db.projectSyncPause.count(pause)).toBe(1);
  expect(await db.auditLog.count(audit)).toBe(0);
  expect(await db.scheduleReviewReceipt.count({ where: { projectId } })).toBe(0);

  await setScheduleState(projectId, actor, id, "active", command, {
    atomic: true,
    gate: true,
    review,
  });
  expect(await db.project.findUniqueOrThrow(project)).toMatchObject({ domainRatingEnabled: true });
  expect(await db.projectSyncPause.count(pause)).toBe(0);
  expect(await db.auditLog.count(audit)).toBe(1);
  expect(await db.scheduleReviewReceipt.count({ where: { projectId } })).toBe(1);
  await expect(
    setScheduleState(projectId, actor, id, "active", command, {
      atomic: true,
      gate: true,
      review,
    }),
  ).rejects.toMatchObject({ code: "schedule_review_stale" });
});
