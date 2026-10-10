import type {
  PersistTrackingResultInput,
  PlanTrackingRunInput,
  SamplePlan,
} from "@/lib/ai-tracking/contract";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isolatedTrackingDatabase, trackingProject } from "./fixtures.postgres-test-support";

const mock = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return mock.client;
  },
}));

import { listTrackingRuns } from "@/lib/ai-tracking/queries/runs";
import { archivePrompt, createPrompt, listPromptRevisions, updatePrompt } from "./prompts";
import { cancelTrackingRun, planTrackingRun, retryTrackingRun } from "./runs";
import { claimTrackingSample, persistTrackingResult, transitionTrackingSample } from "./samples";
import { createSchedule, updateSchedule } from "./schedules";
import { createTopic } from "./topics";

describe("isolated PostgreSQL tracking stores", () => {
  let db: Awaited<ReturnType<typeof isolatedTrackingDatabase>>;
  let a: Awaited<ReturnType<typeof trackingProject>>;
  let b: Awaited<ReturnType<typeof trackingProject>>;
  beforeAll(async () => {
    db = await isolatedTrackingDatabase();
    mock.client = db.client;
    a = await trackingProject(db.client, "a");
    b = await trackingProject(db.client, "b");
  }, 120000);
  afterAll(async () => {
    if (db) await db.dispose();
  });
  function launch(promptId: string, key: string): PlanTrackingRunInput {
    return {
      actorId: a.project.ownerId,
      idempotencyKey: key,
      promptIds: [promptId],
      configurations: [
        {
          provider: "dataforseo",
          endpoint: "/test",
          source: "model_api",
          engine: "chat_gpt",
          model: null,
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
  }
  function result(plan: SamplePlan): PersistTrackingResultInput {
    return {
      attemptId: plan.attemptId,
      expectedDispatch: "claimed",
      measurement: "answer_present",
      evidence: {
        answerText: "Answer with a citation",
        raw: { provider: "test" },
        answerTruncated: false,
        rawTruncated: false,
        searchResults: [{ url: "https://unused.invalid", title: null, position: 0 }],
        requestedLocale: null,
        effectiveLocale: null,
        localeMechanism: null,
        requestedModel: null,
        actualModel: null,
        providerStatus: "20000",
        observedAt: "2026-10-08T00:00:00Z",
        fetchedAt: "2026-10-08T00:00:00Z",
        recordedSource: "fresh",
      },
      citations: [{ url: "https://cited.invalid", title: null, position: 0 }],
      observations: [],
      receipt: { providerCostEntryId: null, amountUsd: null, state: "unknown" },
    };
  }
  it("keeps exact revisions and archived history, enforces limits and project FKs", async () => {
    const topic = await createTopic(a.project.id, { name: "A topic" });
    await expect(
      createPrompt(b.project.id, { text: "Cross project", topicId: topic.id }),
    ).rejects.toThrow("Topic not found");
    const prompt = await createPrompt(a.project.id, { text: "  Exact\n", topicId: topic.id });
    await expect(
      db.client.aiPrompt.create({
        data: { projectId: b.project.id, publicId: makePublicId("aip"), topicId: topic.id },
      }),
    ).rejects.toThrow();
    await updatePrompt(a.project.id, prompt.id, { text: "  Exact\n" });
    await updatePrompt(a.project.id, prompt.id, { text: "Exact" });
    const revisions = await listPromptRevisions(a.project.id, prompt.id);
    expect(revisions.map((r) => r.text)).toEqual(["Exact", "  Exact\n"]);
    await expect(
      db.client.aiPromptRevision.update({
        where: { id: revisions[0].id },
        data: { text: "Rewritten" },
      }),
    ).rejects.toThrow("immutable");
    await expect(
      createPrompt(a.project.id, { text: "Over limit" }, { activePrompts: 1, topics: 30 }),
    ).rejects.toThrow("limit");
    await archivePrompt(a.project.id, prompt.id);
    expect(await listPromptRevisions(a.project.id, prompt.id)).toHaveLength(2);
  });
  it("binds launch payloads and occurrences, freezes plans, and claims only once", async () => {
    const prompt = await createPrompt(a.project.id, { text: "Plan this" });
    const input = launch(prompt.id, "race");
    const [first, duplicate] = await Promise.all([
      planTrackingRun(a.project.id, input),
      planTrackingRun(a.project.id, input),
    ]);
    expect(first.id).toBe(duplicate.id);
    await expect(
      planTrackingRun(a.project.id, { ...input, consentRevision: "changed" }),
    ).rejects.toThrow("different tracking payload");
    const sample = first.samples[0];
    expect(await claimTrackingSample(b.project.id, sample.id, sample.attemptId)).toBeNull();
    const claims = await Promise.all([
      claimTrackingSample(a.project.id, sample.id, sample.attemptId),
      claimTrackingSample(a.project.id, sample.id, sample.attemptId),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(
      db.client.aiTrackingSample.update({
        where: { id: sample.id },
        data: { plan: { changed: true } },
      }),
    ).rejects.toThrow("immutable");
    await expect(
      db.client.aiTrackingSample.create({
        data: {
          projectId: sample.projectId,
          runId: sample.runId,
          promptRevisionId: sample.promptRevisionId,
          source: sample.source,
          engine: sample.engine,
          configurationHash: sample.configurationHash,
          attemptId: sample.attemptId,
          id: "duplicate-sample",
          publicId: makePublicId("asm"),
          plan: sample.plan as object,
        },
      }),
    ).rejects.toThrow();
    const schedule = await createSchedule(a.project.id, {
      name: "Disabled",
      cron: "0 8 * * *",
      timezone: "UTC",
      configuration: input,
    });
    expect(schedule.enabled).toBe(false);
    await db.client.aiTrackingSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: new Date("2020-01-01T00:00:00Z") },
    });
    const occurrence = {
      ...input,
      idempotencyKey: "scheduled",
      scheduleId: schedule.id,
      plannedAt: "2026-10-09T08:00:00Z",
    };
    await expect(planTrackingRun(a.project.id, occurrence)).rejects.toThrow("disabled");
    expect(
      (await updateSchedule(a.project.id, schedule.id, { enabled: true })).nextRunAt,
    ).toBeNull();
    await planTrackingRun(a.project.id, occurrence);
    await expect(
      planTrackingRun(a.project.id, { ...occurrence, idempotencyKey: "other" }),
    ).rejects.toThrow("occurrence");
  });
  it("persists citations separately, rejects cached/foreign receipts, and deduplicates results", async () => {
    const prompt = await createPrompt(a.project.id, { text: "Result" });
    const run = await planTrackingRun(a.project.id, launch(prompt.id, "result"));
    const sample = run.samples[0];
    const plan = sample.plan as unknown as SamplePlan;
    await claimTrackingSample(a.project.id, sample.id, plan.attemptId);
    const input = result(plan);
    expect(await persistTrackingResult(b.project.id, sample.id, input)).toBeNull();
    expect(() =>
      persistTrackingResult(a.project.id, sample.id, {
        ...input,
        evidence: { ...input.evidence, recordedSource: "cache" },
      }),
    ).toThrow("Cached");
    const receipt = await db.client.providerCostEntry.create({
      data: {
        projectId: b.project.id,
        connectionId: b.connection.id,
        costCents: "1",
        feature: "ai_tracking",
      },
    });
    await expect(
      db.client.aiTrackingSample.update({
        where: { id: sample.id },
        data: { providerCostEntryId: receipt.id },
      }),
    ).rejects.toThrow();
    await expect(
      persistTrackingResult(a.project.id, sample.id, {
        ...input,
        receipt: { ...input.receipt, providerCostEntryId: receipt.id },
      }),
    ).rejects.toThrow("receipt not found");
    const saved = await persistTrackingResult(a.project.id, sample.id, input);
    expect(saved?.dispatch).toBe("terminal");
    await persistTrackingResult(a.project.id, sample.id, input);
    await expect(
      persistTrackingResult(a.project.id, sample.id, { ...input, measurement: "failed" }),
    ).rejects.toThrow("different payload");
    expect(await db.client.aiTrackingCitation.count({ where: { sampleId: sample.id } })).toBe(1);
    await expect(
      retryTrackingRun(a.project.id, run.id, launch(prompt.id, "unknown-retry")),
    ).rejects.toThrow("reconciliation");
    await expect(
      planTrackingRun(a.project.id, { ...launch(prompt.id, "bypass-retry"), retryOfRunId: run.id }),
    ).rejects.toThrow("reconciliation");
    expect(
      await db.client.aiTrackingRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ state: "completed" });
  });
  it("cancels unstarted work while retaining purchased collection and stable cursors", async () => {
    const prompt = await createPrompt(a.project.id, { text: "Cancel" });
    const run = await planTrackingRun(a.project.id, launch(prompt.id, "cancel"));
    const sample = run.samples[0];
    await claimTrackingSample(a.project.id, sample.id, sample.attemptId);
    await transitionTrackingSample(a.project.id, sample.id, {
      attemptId: sample.attemptId,
      expectedDispatch: "claimed",
      nextDispatch: "submission_started",
    });
    await cancelTrackingRun(a.project.id, run.id);
    expect(
      await transitionTrackingSample(a.project.id, sample.id, {
        attemptId: sample.attemptId,
        expectedDispatch: "submission_started",
        nextDispatch: "submitted",
        providerTaskId: "retained-task",
      }),
    ).not.toBeNull();
    await expect(
      retryTrackingRun(a.project.id, run.id, launch(prompt.id, "retry")),
    ).rejects.toThrow("reconciliation");
    await db.client.aiTrackingRun.updateMany({
      where: { projectId: a.project.id },
      data: { createdAt: new Date("2026-10-08T00:00:00Z") },
    });
    const page = await listTrackingRuns(a.project.id, { limit: 2 });
    const next = await listTrackingRuns(a.project.id, {
      limit: 2,
      cursor: page.nextCursor ?? undefined,
    });
    expect(
      page.items.map((item) => item.id).some((id) => next.items.some((item) => item.id === id)),
    ).toBe(false);
    expect((await listTrackingRuns(b.project.id)).items).toEqual([]);
  });
  it("allows project erasure without foreign references blocking its cascade", async () => {
    await expect(db.client.project.delete({ where: { id: a.project.id } })).resolves.toMatchObject({
      id: a.project.id,
    });
    expect(await db.client.aiTrackingSample.count({ where: { projectId: a.project.id } })).toBe(0);
  });
});
