import "server-only";
import { randomUUID } from "node:crypto";
import { CapacityLimitError } from "@/lib/capacity/errors";
import { z } from "zod";
import { readStoredRun } from "./store";
import {
  type ModelPlaygroundDatabase,
  type ModelPlaygroundTransaction,
  queryRows,
} from "./store-db";
import { storeIdentitySchema } from "./store-validation";

export const trackPresetInputSchema = storeIdentitySchema
  .extend({
    topicId: z.string().min(1).max(256).nullable(),
  })
  .strict();
export type TrackPresetResult =
  | {
      ok: true;
      presetId: string;
      promptId: string;
      reused: boolean;
    }
  | {
      ok: false;
      reason: "invalid_input" | "invalid_topic" | "not_found" | "conflict" | "storage" | "capacity";
    };

type PromptWriter = (
  tx: ModelPlaygroundTransaction,
  text: string,
  topicId: string | null,
) => Promise<{ id: string; publicId: string }>;

/** The project lock matches the AI Visibility prompt store. Never writes a schedule. */
export async function trackModelPlaygroundRun(
  db: ModelPlaygroundDatabase,
  input: unknown,
  createPrompt: PromptWriter,
  prepareTransaction?: (tx: ModelPlaygroundTransaction) => Promise<void>,
  onCommitted?: () => void,
): Promise<TrackPresetResult> {
  const parsed = trackPresetInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_input" };
  const { projectId, runId, topicId } = parsed.data;
  let written = false;
  try {
    const result = await db.$transaction(async (tx): Promise<TrackPresetResult> => {
      await prepareTransaction?.(tx);
      await queryRows(tx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text`, projectId);
      const lock = await queryRows(
        tx,
        `SELECT id FROM model_playground_runs WHERE "projectId"=$1 AND id=$2 FOR UPDATE`,
        projectId,
        runId,
      );
      if (!lock.length) return { ok: false, reason: "not_found" };
      const existing = await queryRows<{
        id: string;
        publicId: string;
        topicId: string | null;
        archivedAt: Date | null;
      }>(
        tx,
        `SELECT preset.id,prompt."publicId",topic."publicId" AS "topicId",topic."archivedAt" FROM model_playground_presets preset JOIN ai_prompts prompt ON prompt.id=preset."promptId" AND prompt."projectId"=preset."projectId" LEFT JOIN ai_topics topic ON topic.id=prompt."topicId" AND topic."projectId"=prompt."projectId" WHERE preset."projectId"=$1 AND preset."runId"=$2`,
        projectId,
        runId,
      );
      // Reopening the existing preset works even when its original topic was archived.
      if (existing[0])
        return existing[0].archivedAt || existing[0].topicId === topicId
          ? { ok: true, presetId: existing[0].id, promptId: existing[0].publicId, reused: true }
          : { ok: false, reason: "conflict" };
      if (
        topicId &&
        !(
          await queryRows(
            tx,
            `SELECT id FROM ai_topics WHERE "projectId"=$1 AND "publicId"=$2 AND "archivedAt" IS NULL`,
            projectId,
            topicId,
          )
        ).length
      )
        return { ok: false, reason: "invalid_topic" };
      const run = await readStoredRun(tx, projectId, runId);
      const prompts = await queryRows<{ id: string; publicId: string }>(
        tx,
        `SELECT prompt.id,prompt."publicId" FROM ai_prompts prompt LEFT JOIN ai_topics topic ON topic.id=prompt."topicId" AND topic."projectId"=prompt."projectId" JOIN LATERAL (SELECT text FROM ai_prompt_revisions WHERE "projectId"=prompt."projectId" AND "promptId"=prompt.id ORDER BY ordinal DESC LIMIT 1) revision ON TRUE WHERE prompt."projectId"=$1 AND prompt."archivedAt" IS NULL AND revision.text=$2 AND topic."publicId" IS NOT DISTINCT FROM $3 ORDER BY prompt.id LIMIT 1`,
        projectId,
        run.snapshot.input.prompt,
        topicId,
      );
      const prompt = prompts[0] ?? (await createPrompt(tx, run.snapshot.input.prompt, topicId));
      const id = randomUUID();
      await queryRows(
        tx,
        `INSERT INTO model_playground_presets(id,"projectId","runId","promptId",config,mode,"scheduleEnabled") VALUES($1,$2,$3,$4,$5::jsonb,'manual',false)`,
        id,
        projectId,
        runId,
        prompt.id,
        JSON.stringify(run.snapshot.input),
      );
      written = true;
      return { ok: true, presetId: id, promptId: prompt.publicId, reused: Boolean(prompts[0]) };
    });
    if (written) onCommitted?.();
    return result;
  } catch (error) {
    if (
      error instanceof CapacityLimitError ||
      (error instanceof Error && error.message === "Tracking prompt limit reached.")
    )
      return { ok: false, reason: "capacity" };
    return { ok: false, reason: "storage" };
  }
}
