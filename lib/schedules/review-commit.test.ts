import { signSettingsQuote } from "@/lib/measurement-settings/host/quote-binding";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScheduleReviewGateError,
  ScheduleReviewRequiredError,
  ScheduleReviewStaleError,
} from "./errors";
import { previewScheduleChange, type ScheduleChange } from "./preview";
import { scheduleReviewBinding } from "./review-binding";
import { commitReviewedScheduleWrite, WEB_UNGATED_REVIEW } from "./review-commit";

const now = new Date("2026-10-08T12:00:00.000Z");
const mocks = vi.hoisted(() => ({ defaults: vi.fn(), rank: vi.fn(), transaction: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    checkSchedule: { findFirst: mocks.rank },
    keyword: { count: vi.fn(async () => 2), findMany: vi.fn(async () => []) },
    projectDefaults: { findUnique: mocks.defaults },
    providerConnection: { findFirst: vi.fn(async () => null) },
    $transaction: mocks.transaction,
  },
}));

const actor = { id: "user_1", memberships: [] };
const otherActor = { id: "user_2", memberships: [] };
const scheduleId = "sch_a00000000000000000000000" as const;
const projectId = "prj_a00000000000000000000000" as const;
const rank = {
  archivedAt: null,
  cronExpression: null,
  enabled: true,
  frequency: "weekly" as const,
  jitterMinutes: 0,
  measurementEpoch: 4n,
  providerPolicy: "dataforseo",
  publicId: scheduleId,
  serpDepth: 20,
  timeOfDay: null,
  timezone: "UTC",
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
};

function change(frequency: "daily" | "monthly" | "weekly" = "daily"): ScheduleChange {
  return {
    body: {
      input: { frequency, projectId, scheduleId },
      kind: "rank" as const,
    },
    id: scheduleId,
    op: "update" as const,
  };
}

function write(
  options: Parameters<typeof commitReviewedScheduleWrite>[0]["options"],
  run?: (consent: unknown) => Promise<unknown>,
  at = now,
  who = actor,
  next: ScheduleChange = change(),
) {
  return commitReviewedScheduleWrite({
    actor: who,
    change: next,
    now: at,
    options,
    projectId: "project_1",
    run: run ?? (async () => "written"),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.defaults.mockResolvedValue({ serpDepth: 20, timezone: "UTC" });
  mocks.rank.mockResolvedValue(rank);
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRaw: vi.fn(async () => []),
      checkSchedule: {
        findFirst: mocks.rank,
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      keyword: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
      scheduleReviewReceipt: {
        create: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async () => []),
      },
    }),
  );
});

describe("schedule review permit", () => {
  it("rejects a missing review and ignores a client consent summary as authority", async () => {
    await expect(
      write({ gate: true, review: { consent_summary: { confirmed: true } } }),
    ).rejects.toBeInstanceOf(ScheduleReviewRequiredError);
    const preview = await previewScheduleChange("project_1", actor, change(), now);
    const consented = await write(
      {
        review: {
          consent_summary: { confirmed: false, source: "client" },
          expected_revision: preview.expected_revision,
          preview_token: preview.preview_token ?? "",
          window_start: preview.window_start,
        },
      },
      async (consent) => consent,
    );
    expect(consented).toEqual({ confirmed: false, source: "client" });
  });

  it("rejects a stale revision, another change, another actor, and an expired token", async () => {
    const at = new Date(now.getTime() + 2000);
    const preview = await previewScheduleChange("project_1", actor, change(), at);
    const token = preview.preview_token ?? "";
    const review = {
      expected_revision: preview.expected_revision,
      preview_token: token,
      window_start: preview.window_start,
    };
    await expect(
      write({ review: { expected_revision: "1", preview_token: token } }, undefined, at),
    ).rejects.toMatchObject({
      name: "ScheduleReviewStaleError",
      reason: "preview_mismatch",
    });
    const faster = {
      body: {
        input: {
          cronExpression: "0 * * * *",
          frequency: "custom_cron" as const,
          projectId,
          scheduleId,
        },
        kind: "rank" as const,
      },
      id: scheduleId,
      op: "update" as const,
    };
    await expect(write({ review }, undefined, at, actor, faster)).rejects.toBeInstanceOf(
      ScheduleReviewStaleError,
    );
    await expect(write({ review }, undefined, at, otherActor)).rejects.toMatchObject({
      reason: "preview_mismatch",
    });
    await expect(
      write({ review }, undefined, new Date(at.getTime() + 11 * 60 * 1000)),
    ).rejects.toMatchObject({ reason: "preview_expired" });
  });

  it("spends a token once and releases it when the mutation fails", async () => {
    const spentAt = new Date(now.getTime() + 3000);
    const preview = await previewScheduleChange("project_1", actor, change(), spentAt);
    const review = {
      expected_revision: preview.expected_revision,
      preview_token: preview.preview_token ?? "",
      window_start: preview.window_start,
    };
    await expect(write({ review }, undefined, spentAt)).resolves.toBe("written");
    await expect(write({ review }, undefined, spentAt)).rejects.toMatchObject({
      reason: "preview_reused",
    });
    const at = new Date(now.getTime() + 4000);
    const retry = await previewScheduleChange("project_1", actor, change(), at);
    const released = {
      expected_revision: retry.expected_revision,
      preview_token: retry.preview_token ?? "",
      window_start: retry.window_start,
    };
    await expect(
      write(
        { review: released },
        async () => {
          throw new Error("rolled back");
        },
        at,
      ),
    ).rejects.toThrow("rolled back");
    await expect(write({ review: released }, undefined, at)).resolves.toBe("written");
  });

  it("throws when a caller omits the gate and accepts the explicit web marker", async () => {
    await expect(
      commitReviewedScheduleWrite({
        actor,
        change: change(),
        now,
        projectId: "project_1",
        run: async () => "web",
      }),
    ).rejects.toBeInstanceOf(ScheduleReviewGateError);
    await expect(
      commitReviewedScheduleWrite({
        actor,
        change: change(),
        now,
        options: WEB_UNGATED_REVIEW,
        projectId: "project_1",
        run: async () => "web",
      }),
    ).resolves.toBe("web");
    expect(mocks.transaction).not.toHaveBeenCalled();
    await expect(
      commitReviewedScheduleWrite({
        actor,
        change: { command: { kind: "rank" }, id: scheduleId, op: "state", state: "paused" },
        now,
        options: { gate: true },
        projectId: "project_1",
        run: async () => "paused",
      }),
    ).resolves.toBe("paused");
  });

  it("rejects a token signed for another purpose", async () => {
    const at = new Date(now.getTime() + 5000);
    const preview = await previewScheduleChange("project_1", actor, change(), at);
    const binding = scheduleReviewBinding(
      "project_1",
      actor.id,
      change(),
      preview.expected_revision,
      {
        ...preview,
        window_start: preview.window_start,
      },
    );
    const foreign = signSettingsQuote("defaults", binding, at).token;
    await expect(
      write(
        {
          review: {
            expected_revision: preview.expected_revision,
            preview_token: foreign,
            window_start: preview.window_start,
          },
        },
        undefined,
        at,
      ),
    ).rejects.toBeInstanceOf(ScheduleReviewStaleError);
  });

  it("keeps a preview valid after UTC midnight when the submit echoes its window", async () => {
    const evening = new Date("2026-10-08T23:56:00.000Z");
    const morning = new Date("2026-10-09T00:02:00.000Z");
    const preview = await previewScheduleChange("project_1", actor, change(), evening);
    await expect(
      write(
        {
          review: {
            expected_revision: preview.expected_revision,
            preview_token: preview.preview_token ?? "",
            window_start: preview.window_start,
          },
        },
        undefined,
        morning,
      ),
    ).resolves.toBe("written");
    const again = await previewScheduleChange(
      "project_1",
      actor,
      change(),
      new Date(evening.getTime() + 1000),
    );
    await expect(
      write(
        {
          review: {
            expected_revision: again.expected_revision,
            preview_token: again.preview_token ?? "",
          },
        },
        undefined,
        morning,
      ),
    ).rejects.toBeInstanceOf(ScheduleReviewStaleError);
  });
});
