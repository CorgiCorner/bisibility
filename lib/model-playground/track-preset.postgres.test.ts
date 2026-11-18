import { CapacityLimitError } from "@/lib/capacity/errors";
import { expect, it } from "vitest";
import { historyHarness } from "./history.test-support";
import { trackModelPlaygroundRun } from "./track-preset";

const h = historyHarness();

const transitions: Array<readonly [string, () => Promise<void>]> = [];
const scenario = (name: string, run: () => Promise<void>) => transitions.push([name, run]);

for (const error of [
  new CapacityLimitError({
    dimension: "trackedPrompts",
    limit: 1,
    used: 1,
    requested: 1,
    scope: "project",
  }),
  new Error("Tracking prompt limit reached."),
])
  scenario(
    `rolls back capacity refusal ${error.name} and permits an explicit later save`,
    async () => {
      const run = await h.launch();
      const request = { projectId: "project-a", runId: run.id, topicId: null };
      expect(
        await trackModelPlaygroundRun(h.database, request, async (...args) => {
          await h.createPrompt(...args);
          throw error;
        }),
      ).toEqual({ ok: false, reason: "capacity" });
      for (const table of ["ai_prompts", "ai_prompt_revisions", "model_playground_presets"])
        expect((await h.db.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
      expect((await trackModelPlaygroundRun(h.database, request, h.createPrompt)).ok).toBe(true);
    },
  );

scenario(
  "serializes duplicate clicks and retains every configuration field without schedules",
  async () => {
    const run = await h.launch();
    const input = { projectId: "project-a", runId: run.id, topicId: null };
    const saved = await Promise.all([
      trackModelPlaygroundRun(h.database, input, h.createPrompt),
      trackModelPlaygroundRun(h.database, input, h.createPrompt),
    ]);
    expect(saved[0].ok).toBe(true);
    expect(saved[1]).toEqual({ ...saved[0], reused: true });
    const presets = (
      await h.db.query<{ config: unknown; mode: string; scheduleEnabled: boolean }>(
        `SELECT * FROM model_playground_presets`,
      )
    ).rows;
    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({
      config: run.snapshot.input,
      mode: "manual",
      scheduleEnabled: false,
    });
    expect(
      (await h.db.query(`SELECT * FROM ai_prompts WHERE "pausedAt" IS NOT NULL`)).rows,
    ).toHaveLength(1);
    expect((await h.db.query(`SELECT * FROM ai_prompt_revisions`)).rows).toHaveLength(1);
  },
);
for (const topicId of ["missing", "ait_bbbbbbbbbbbbbbbbbbbbbbbb"])
  scenario(`refuses invalid or foreign topic ${topicId} before writes`, async () => {
    const run = await h.launch();
    expect(
      await trackModelPlaygroundRun(
        h.database,
        { projectId: "project-a", runId: run.id, topicId },
        h.createPrompt,
      ),
    ).toEqual({ ok: false, reason: "invalid_topic" });
    expect((await h.db.query(`SELECT * FROM ai_prompts`)).rows).toHaveLength(0);
    expect(
      (
        await trackModelPlaygroundRun(
          h.database,
          { projectId: "project-a", runId: run.id, topicId: null },
          h.createPrompt,
        )
      ).ok,
    ).toBe(true);
  });
scenario(
  "refuses a foreign run, preserves existing prompt and rejects a changed topic",
  async () => {
    const run = await h.launch();
    await h.database.$transaction((tx) => h.createPrompt(tx, run.snapshot.input.prompt, null));
    expect(
      await trackModelPlaygroundRun(
        h.database,
        { projectId: "project-b", runId: run.id, topicId: null },
        h.createPrompt,
      ),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(
      await trackModelPlaygroundRun(
        h.database,
        { projectId: "project-a", runId: run.id, topicId: null },
        h.createPrompt,
      ),
    ).toMatchObject({ ok: true, reused: true });
    expect((await h.db.query(`SELECT * FROM ai_prompts`)).rows).toHaveLength(1);
    expect(
      await trackModelPlaygroundRun(
        h.database,
        { projectId: "project-a", runId: run.id, topicId: "ait_aaaaaaaaaaaaaaaaaaaaaaaa" },
        h.createPrompt,
      ),
    ).toEqual({ ok: false, reason: "conflict" });
  },
);
scenario("rolls back prompt creation when saving the preset fails and retries safely", async () => {
  const run = await h.launch();
  await h.db.exec(
    `CREATE FUNCTION reject_preset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER reject_preset BEFORE INSERT ON model_playground_presets FOR EACH ROW EXECUTE FUNCTION reject_preset();`,
  );
  const input = { projectId: "project-a", runId: run.id, topicId: null };
  expect(await trackModelPlaygroundRun(h.database, input, h.createPrompt)).toEqual({
    ok: false,
    reason: "storage",
  });
  expect((await h.db.query(`SELECT * FROM ai_prompts`)).rows).toHaveLength(0);
  await h.db.exec(`DROP TRIGGER reject_preset ON model_playground_presets;`);
  expect((await trackModelPlaygroundRun(h.database, input, h.createPrompt)).ok).toBe(true);
});
scenario("rejects caller-supplied configuration or credentials", async () => {
  const run = await h.launch();
  const input = {
    projectId: "project-a",
    runId: run.id,
    topicId: null,
    config: { apiKey: "synthetic" },
  };
  expect(await trackModelPlaygroundRun(h.database, input, h.createPrompt)).toEqual({
    ok: false,
    reason: "invalid_input",
  });
  delete (input as { config?: unknown }).config;
  expect((await trackModelPlaygroundRun(h.database, input, h.createPrompt)).ok).toBe(true);
});

it.each(transitions)("%s", async (_name, run) => run());

it("reopens a preset whose original topic was archived, including from Unassigned", async () => {
  const run = await h.launch();
  const request = {
    projectId: "project-a",
    runId: run.id,
    topicId: "ait_aaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const saved = await trackModelPlaygroundRun(h.database, request, h.createPrompt);
  expect(saved.ok).toBe(true);
  await h.db.exec(`UPDATE ai_topics SET "archivedAt"=CURRENT_TIMESTAMP WHERE id='topic-a'`);
  for (const topicId of [null, request.topicId])
    expect(
      await trackModelPlaygroundRun(h.database, { ...request, topicId }, h.createPrompt),
    ).toEqual({ ...saved, reused: true });
  expect((await h.db.query(`SELECT * FROM model_playground_presets`)).rows).toHaveLength(1);
});
