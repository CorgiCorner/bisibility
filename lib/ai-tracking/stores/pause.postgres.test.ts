import type { PlanTrackingRunInput } from "@/lib/ai-tracking/contract";
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

import { createPrompt, listPrompts, updatePrompt } from "./prompts";
import { planTrackingRun } from "./runs";
import { claimTrackingSample, persistTrackingResult } from "./samples";
import { createSchedule } from "./schedules";
import { createTopic, listTopics, updateTopic } from "./topics";

describe("tracking pause state", () => {
  let db: Awaited<ReturnType<typeof isolatedTrackingDatabase>>;
  let a: Awaited<ReturnType<typeof trackingProject>>;
  beforeAll(async () => {
    db = await isolatedTrackingDatabase();
    mock.client = db.client;
    a = await trackingProject(db.client, "pause");
  }, 120000);
  afterAll(async () => {
    if (db) await db.dispose();
  });
  it("preserves revisions, skips paused topics, and atomically rejects over-limit resumes", async () => {
    const limits = { activePrompts: 1, topics: 1 };
    const topic = await createTopic(a.project.id, { name: "Paused topic" }, limits);
    const prompt = await createPrompt(
      a.project.id,
      { text: "Retained bytes\n", topicId: topic.id },
      limits,
    );
    const input: PlanTrackingRunInput = {
      actorId: a.project.ownerId,
      idempotencyKey: "paused",
      promptIds: [prompt.id],
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
    await updateTopic(a.project.id, topic.id, { paused: true }, limits);
    await expect(planTrackingRun(a.project.id, input)).rejects.toThrow("Active tracking prompts");
    const schedule = await createSchedule(a.project.id, {
      name: "Paused",
      enabled: true,
      cron: "0 8 * * *",
      timezone: "UTC",
      configuration: input,
    });
    const skipped = await planTrackingRun(a.project.id, {
      ...input,
      origin: "scheduled",
      scheduleId: schedule.id,
      plannedAt: "2026-10-10T08:00:00Z",
    });
    expect(skipped).toMatchObject({ state: "skipped", samples: [] });
    const active = await createPrompt(a.project.id, { text: "Active" }, limits);
    const paused = await createPrompt(a.project.id, { text: "Draft", paused: true }, limits);
    await expect(updateTopic(a.project.id, topic.id, { paused: false }, limits)).rejects.toThrow(
      "limit",
    );
    expect((await listTopics(a.project.id))[0].pausedAt).not.toBeNull();
    await updatePrompt(a.project.id, active.id, { paused: true }, limits);
    await updateTopic(a.project.id, topic.id, { paused: false }, limits);
    await expect(updatePrompt(a.project.id, paused.id, { paused: false }, limits)).rejects.toThrow(
      "limit",
    );
    const retained = (await listPrompts(a.project.id)).find((row) => row.id === prompt.id);
    expect(retained?.revisions.map((revision) => revision.text)).toEqual(["Retained bytes\n"]);
    expect(
      (await listPrompts(a.project.id)).find((row) => row.id === paused.id)?.pausedAt,
    ).not.toBeNull();
  });
  it("revises category independently while retaining exact prompt bytes", async () => {
    const prompt = await createPrompt(a.project.id, {
      text: " Exact category bytes\n",
      category: "branded",
    });
    const changed = await updatePrompt(a.project.id, prompt.id, { category: "comparative" });
    expect(changed.revisions.map((revision) => revision.category)).toEqual([
      "comparative",
      "branded",
    ]);
    expect(changed.revisions[0].text).toBe(changed.revisions[1].text);
    expect(changed.revisions[0].textHash).toBe(changed.revisions[1].textHash);
    await expect(
      db.client.aiPromptRevision.update({
        where: { id: changed.revisions[0].id },
        data: { category: "neutral" },
      }),
    ).rejects.toThrow("immutable");
  });
  it("keeps launch category and competitor evidence after later edits or deletion", async () => {
    const competitor = await db.client.competitor.create({
      data: {
        projectId: a.project.id,
        publicId: makePublicId("cmp"),
        domain: "retained.invalid",
        label: "OldBrand",
        aliases: ["OldBrand"],
      },
    });
    const prompt = await createPrompt(a.project.id, {
      text: "Retained category",
      category: "branded",
    });
    const input: PlanTrackingRunInput = {
      actorId: a.project.ownerId,
      idempotencyKey: "retained",
      promptIds: [prompt.id],
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
    const run = await planTrackingRun(a.project.id, input);
    const sample = run.samples[0];
    await updatePrompt(a.project.id, prompt.id, { category: "comparative" });
    expect(sample.plan).toMatchObject({ promptCategory: "branded" });
    await db.client.competitor.delete({ where: { id: competitor.id } });
    await claimTrackingSample(a.project.id, sample.id, sample.attemptId);
    const saved = await persistTrackingResult(a.project.id, sample.id, {
      attemptId: sample.attemptId,
      expectedDispatch: "claimed",
      measurement: "answer_present",
      evidence: {
        answerText: "OldBrand",
        raw: {},
        answerTruncated: false,
        rawTruncated: false,
        searchResults: [],
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
      citations: [],
      observations: [
        {
          entityKey: competitor.id,
          competitorId: competitor.id,
          name: "OldBrand",
          mentioned: true,
          position: 0,
          aliases: ["OldBrand"],
          matchPolicy: "literal",
          confidence: 1,
          snippet: "OldBrand",
        },
      ],
      receipt: { providerCostEntryId: null, amountUsd: null, state: "unknown" },
    });
    expect(saved?.dispatch).toBe("terminal");
    expect(
      await db.client.aiTrackingEntityObservation.findFirst({ where: { sampleId: sample.id } }),
    ).toMatchObject({ name: "OldBrand", competitorId: competitor.id });
  });
});
