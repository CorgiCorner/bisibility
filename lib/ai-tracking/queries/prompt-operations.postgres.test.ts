import type { PlanTrackingRunInput } from "@/lib/ai-tracking/contract";
import {
  isolatedTrackingDatabase,
  trackingProject,
} from "@/lib/ai-tracking/stores/fixtures.postgres-test-support";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return mock.client;
  },
}));

import { createPrompt, updatePrompt } from "@/lib/ai-tracking/stores/prompts";
import { planTrackingRun } from "@/lib/ai-tracking/stores/runs";
import { createSchedule } from "@/lib/ai-tracking/stores/schedules";
import { getTrackingPromptOperations } from "./prompt-operations";

describe("bounded prompt operations", () => {
  let db: Awaited<ReturnType<typeof isolatedTrackingDatabase>>;
  let a: Awaited<ReturnType<typeof trackingProject>>;
  let b: Awaited<ReturnType<typeof trackingProject>>;
  beforeAll(async () => {
    db = await isolatedTrackingDatabase();
    mock.client = db.client;
    a = await trackingProject(db.client, "operations-a");
    b = await trackingProject(db.client, "operations-b");
  }, 120000);
  afterAll(async () => {
    if (db) await db.dispose();
  });
  it("selects latest history across revisions and earliest occurrence across capped schedules", async () => {
    const prompt = await createPrompt(a.project.id, { text: "Old immutable revision" });
    const empty = await createPrompt(a.project.id, { text: "No sample" });
    const foreign = await createPrompt(b.project.id, { text: "Foreign prompt" });
    const input: PlanTrackingRunInput = {
      actorId: a.project.ownerId,
      idempotencyKey: "operations",
      promptIds: [prompt.id],
      configurations: [
        {
          provider: "dataforseo",
          endpoint: "/fixture",
          engine: "chat_gpt",
          source: "model_api",
          model: "fixture",
          parameters: {},
        },
      ],
      credentialConnectionId: a.connection.id,
      credentialVersion: "v1",
      budgetRevision: "b1",
      consentRevision: "c1",
      origin: "manual",
      entrySource: "app",
      deadline: "2027-01-01T00:00:00Z",
    };
    const old = await planTrackingRun(a.project.id, input);
    await updatePrompt(a.project.id, prompt.id, { text: "New revision" });
    const latest = await planTrackingRun(a.project.id, {
      ...input,
      idempotencyKey: "operations-new",
    });
    await db.client.aiTrackingSample.update({
      where: { id: old.samples[0].id },
      data: {
        createdAt: new Date("2026-10-10T00:00:00Z"),
        evidence: { observedAt: "2026-10-09T00:00:00Z" },
        measurement: "answer_present",
      },
    });
    await db.client.aiTrackingSample.update({
      where: { id: latest.samples[0].id },
      data: { createdAt: new Date("2026-10-08T00:00:00Z") },
    });
    const schedule = (name: string, enabled: boolean, nextRunAt: string | null) =>
      createSchedule(a.project.id, {
        name,
        enabled,
        nextRunAt,
        cron: "0 8 * * *",
        timezone: "UTC",
        configuration: input,
      });
    await schedule("Disabled earliest", false, "2026-10-09T00:00:00Z");
    await schedule("Uninitialized", true, null);
    const earliest = await schedule("Earliest enabled", true, "2026-10-11T00:00:00Z");
    await schedule("Second", true, "2026-10-12T00:00:00Z");
    await schedule("Third", true, "2026-10-13T00:00:00Z");
    const archived = await schedule("Archived", true, "2026-10-09T00:00:00Z");
    await db.client.aiTrackingSchedule.update({
      where: { id: archived.id },
      data: { archivedAt: new Date() },
    });
    const rows = await getTrackingPromptOperations(a.project.id, [prompt.id, empty.id, foreign.id]);
    expect(rows[foreign.id]).toBeUndefined();
    expect(rows[empty.id]).toMatchObject({
      latestSample: null,
      upcomingSchedules: [],
      upcomingScheduleCount: 0,
    });
    expect(rows[prompt.id].latestSample).toMatchObject({
      publicId: old.samples[0].publicId,
      promptRevision: { publicId: prompt.revisions[0].publicId, text: "Old immutable revision" },
      measurement: "answer_present",
      evidence: { observedAt: "2026-10-09T00:00:00Z" },
    });
    expect(rows[prompt.id]).toMatchObject({
      upcomingScheduleCount: 4,
      upcomingTruncated: true,
      earliestNextRunAt: new Date("2026-10-11T00:00:00Z"),
    });
    expect(rows[prompt.id].upcomingSchedules).toHaveLength(3);
    expect(rows[prompt.id].upcomingSchedules[0].schedulePublicId).toBe(earliest.publicId);
    expect(rows[prompt.id].upcomingSchedules[0].configurations).toEqual(input.configurations);
    await expect(
      getTrackingPromptOperations(a.project.id, Array(101).fill(prompt.id)),
    ).rejects.toThrow("100");
  });
});
