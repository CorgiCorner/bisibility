import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ScheduleReviewStaleError } from "./errors";
import { type ScheduleUpdateInput, updateSchedule } from "./mutations";
import { previewScheduleChange, type ScheduleChange } from "./preview";
import { commitReviewedScheduleWrite, WEB_UNGATED_REVIEW } from "./review-commit";
import { clearScheduleReviewSpentForTests } from "./review-permit";
import { seedReviewProject, startReviewFixture } from "./review-permit.postgres-fixture";

const store = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, key) => {
        const db = store.db;
        if (!db) throw new Error("Fixture database is not ready.");
        const value = db[key as keyof PrismaClient];
        return typeof value === "function" ? value.bind(db) : value;
      },
    },
  ),
}));

describe("schedule review permit on PostgreSQL", () => {
  let fixture: Awaited<ReturnType<typeof startReviewFixture>>;
  let left: PrismaClient;
  let right: PrismaClient;

  beforeAll(async () => {
    fixture = await startReviewFixture();
    left = fixture.left;
    right = fixture.right;
    store.db = left;
  }, 180_000);

  afterAll(async () => {
    await fixture?.stop();
  });

  function seed() {
    return seedReviewProject(left);
  }

  function rankChange(seeded: Awaited<ReturnType<typeof seed>>) {
    return {
      body: {
        input: {
          frequency: "daily" as const,
          projectId: seeded.projectPublicId as `prj_${string}`,
          scheduleId: seeded.schedulePublicId as `sch_${string}`,
        },
        kind: "rank" as const,
      },
      id: seeded.schedulePublicId,
      op: "update" as const,
    };
  }

  async function submitRank(
    db: PrismaClient,
    seeded: Awaited<ReturnType<typeof seed>>,
    review: { expected_revision: string; preview_token: string; window_start: string },
    now: Date,
  ) {
    return updateSchedule(
      seeded.projectId,
      seeded.actor,
      seeded.schedulePublicId,
      rankChange(seeded).body as ScheduleUpdateInput,
      {
        db: { $transaction: (callback, options) => db.$transaction(callback, options) },
        gate: true,
        now,
        review,
      },
    );
  }

  it("consumes a rank update token and lets a failed write be retried", async () => {
    const seeded = await seed();
    const now = new Date("2026-10-08T12:00:00.000Z");
    const preview = await previewScheduleChange(
      seeded.projectId,
      seeded.actor,
      rankChange(seeded) as ScheduleChange,
      now,
    );
    const review = {
      expected_revision: preview.expected_revision,
      preview_token: preview.preview_token ?? "",
      window_start: preview.window_start,
    };
    await submitRank(left, seeded, review, now);
    await expect(submitRank(right, seeded, review, now)).rejects.toBeInstanceOf(
      ScheduleReviewStaleError,
    );
    const schedule = () =>
      left.checkSchedule.findFirstOrThrow({ where: { publicId: seeded.schedulePublicId } });
    expect((await schedule()).frequency).toBe("daily");
    await left.checkSchedule.update({
      data: { frequency: "weekly" },
      where: { publicId: seeded.schedulePublicId },
    });
    const failingAt = new Date("2026-10-08T12:05:00.000Z");
    const retryPreview = await previewScheduleChange(
      seeded.projectId,
      seeded.actor,
      rankChange(seeded) as ScheduleChange,
      failingAt,
    );
    const retry = {
      expected_revision: retryPreview.expected_revision,
      preview_token: retryPreview.preview_token ?? "",
      window_start: retryPreview.window_start,
    };
    const receipts = () =>
      left.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } });
    expect(await receipts()).toBe(1);
    await left.project.update({
      data: { writeMode: "migration_hold" },
      where: { id: seeded.projectId },
    });
    await expect(submitRank(left, seeded, retry, failingAt)).rejects.toThrow();
    expect((await schedule()).frequency).toBe("weekly");
    expect(await receipts()).toBe(1);
    await left.project.update({ data: { writeMode: "active" }, where: { id: seeded.projectId } });
    await submitRank(left, seeded, retry, failingAt);
    expect((await schedule()).frequency).toBe("daily");
  }, 60_000);

  it("lets one token assign keywords once across two database clients", async () => {
    const seeded = await seed();
    const source = await left.checkSchedule.create({
      data: {
        enabled: true,
        frequency: "monthly",
        name: "Monthly",
        projectId: seeded.projectId,
        providerPolicy: "dataforseo",
        publicId: makePublicId("sch"),
      },
    });
    const keyword = await left.keyword.create({
      data: {
        checkScheduleId: source.id,
        location: "United States",
        locationId: (await left.location.findFirstOrThrow()).id,
        projectId: seeded.projectId,
        publicId: makePublicId("kw"),
        text: "second keyword",
      },
    });
    const now = new Date("2026-10-08T13:00:00.000Z");
    const body = {
      kind: "rank-membership" as const,
      membership: {
        keywordIds: [keyword.publicId as `kw_${string}`],
        projectId: seeded.projectPublicId as `prj_${string}`,
        scheduleId: seeded.schedulePublicId as `sch_${string}`,
      },
      operation: "assign" as const,
    };
    const preview = await previewScheduleChange(
      seeded.projectId,
      seeded.actor,
      { body, id: seeded.schedulePublicId, op: "update" } as ScheduleChange,
      now,
    );
    const submit = (db: PrismaClient) =>
      updateSchedule(
        seeded.projectId,
        seeded.actor,
        seeded.schedulePublicId,
        body as ScheduleUpdateInput,
        {
          db: { $transaction: (callback, options) => db.$transaction(callback, options) },
          gate: true,
          now,
          review: {
            expected_revision: preview.expected_revision,
            preview_token: preview.preview_token ?? "",
            window_start: preview.window_start,
          },
        },
      );
    const [first, second] = await Promise.allSettled([submit(left), submit(right)]);
    const fulfilled = [first, second].filter((row) => row.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(
      (await left.keyword.findUniqueOrThrow({ where: { id: keyword.id } })).checkScheduleId,
    ).toBe(
      (await left.checkSchedule.findFirstOrThrow({ where: { publicId: seeded.schedulePublicId } }))
        .id,
    );
    await expect(submit(left)).rejects.toBeInstanceOf(ScheduleReviewStaleError);
  }, 60_000);

  it("returns preview_reused when a second client replays a token for an unchanged revision", async () => {
    const seeded = await seed();
    const now = new Date("2026-10-08T15:00:00.000Z");
    const change = rankChange(seeded) as ScheduleChange;
    const preview = await previewScheduleChange(seeded.projectId, seeded.actor, change, now);
    const submit = (db: PrismaClient) =>
      commitReviewedScheduleWrite({
        actor: seeded.actor,
        change,
        now,
        options: {
          db: { $transaction: (callback, options) => db.$transaction(callback, options) },
          gate: true,
          now,
          review: {
            expected_revision: preview.expected_revision,
            preview_token: preview.preview_token ?? "",
            window_start: preview.window_start,
          },
        },
        projectId: seeded.projectId,
        run: async () => "created",
      });
    await submit(left);
    clearScheduleReviewSpentForTests();
    await expect(submit(right)).rejects.toMatchObject({ reason: "preview_reused" });
    expect(await left.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(
      1,
    );
  }, 60_000);

  it("completes a gated write and an ungated write without a deadlock", async () => {
    const seeded = await seed();
    const now = new Date("2026-10-08T16:00:00.000Z");
    const preview = await previewScheduleChange(
      seeded.projectId,
      seeded.actor,
      rankChange(seeded) as ScheduleChange,
      now,
    );
    const review = {
      expected_revision: preview.expected_revision,
      preview_token: preview.preview_token ?? "",
      window_start: preview.window_start,
    };
    const gated = submitRank(left, seeded, review, now);
    const ungated = updateSchedule(
      seeded.projectId,
      seeded.actor,
      seeded.schedulePublicId,
      {
        ...rankChange(seeded).body,
        input: { ...rankChange(seeded).body.input, frequency: "monthly" },
      } as ScheduleUpdateInput,
      {
        db: { $transaction: (callback, options) => right.$transaction(callback, options) },
        now,
        ...WEB_UNGATED_REVIEW,
      },
    );
    const settled = await Promise.allSettled([gated, ungated]);
    for (const result of settled) {
      if (result.status === "rejected") {
        const error = result.reason as { code?: string; message?: string };
        expect(error.code).not.toBe("P2034");
        expect(error.code).not.toBe("40P01");
        expect(error.message ?? "").not.toMatch(/deadlock/i);
      }
    }
    expect(settled.some((result) => result.status === "fulfilled")).toBe(true);
  }, 60_000);
});
