"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { readModelPlaygroundHistory } from "@/lib/ai-research/model-playground-history";
import {
  openStoredKeywordResearch,
  readKeywordResearchHistory,
} from "@/lib/keyword-research/history";
import { modelPlaygroundDatabase } from "@/lib/model-playground/database";
import { readRetainedModelRun } from "@/lib/model-playground/history";
import { saveModelPlaygroundReport } from "@/lib/model-playground/report";
import { loadModelReportEntities } from "@/lib/model-playground/report-context";
import { readPlaygroundHistory } from "@/lib/provider-comparison/playground-history";
import { historyRequestSchema, storedResearchSchema } from "@/lib/research-history/input";
import { z } from "zod";
import { getActionActor, requireProjectScope } from "./_shared";

async function readableProject(projectRef: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectRef, { type: "project" });
  return { actor, project };
}

export async function loadModelPlaygroundHistoryAction(input: unknown) {
  try {
    const value = historyRequestSchema.parse(input);
    const { actor, project } = await readableProject(value.projectRef);
    return {
      ok: true as const,
      page: await readModelPlaygroundHistory(project.id, actor.id, value),
    };
  } catch {
    return { ok: false as const };
  }
}

export async function loadSerpPlaygroundHistoryAction(input: unknown) {
  try {
    const value = historyRequestSchema.parse(input);
    const { actor, project } = await readableProject(value.projectRef);
    return {
      ok: true as const,
      page: await readPlaygroundHistory(project.id, actor.id, value),
    };
  } catch {
    return { ok: false as const };
  }
}

export async function loadKeywordResearchHistoryAction(input: unknown) {
  try {
    const value = historyRequestSchema.parse(input);
    const { actor, project } = await readableProject(value.projectRef);
    return {
      ok: true as const,
      page: await readKeywordResearchHistory(project.id, actor.id, value),
    };
  } catch {
    return { ok: false as const };
  }
}

export async function readStoredKeywordResearchAction(input: unknown) {
  try {
    const value = storedResearchSchema.parse(input);
    const { project } = await readableProject(value.projectRef);
    const stored = await openStoredKeywordResearch({
      projectId: project.id,
      requestKey: value.requestKey,
    });
    return stored ? { ok: true as const, stored } : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}

export async function saveModelPlaygroundReportAction(input: unknown) {
  const ref = z.object({ projectRef: z.string() }).safeParse(input);
  if (!ref.success) return { ok: false as const, reason: "invalid_input" as const };
  let project: Awaited<ReturnType<typeof requireProjectScope>>;
  let actor: Awaited<ReturnType<typeof getActionActor>>;
  try {
    actor = await getActionActor();
    project = await requireProjectScope(
      actor,
      "update",
      ref.data.projectRef,
      { type: "project" },
      { allowReadOnly: true },
    );
  } catch {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const value = z
    .object({ projectRef: z.string(), runId: z.uuid(), explicit: z.boolean().default(false) })
    .strict()
    .safeParse(input);
  if (!value.success) return { ok: false as const, reason: "invalid_input" as const };
  try {
    const entities = await loadModelReportEntities(modelPlaygroundDatabase, project.id);
    const result = await saveModelPlaygroundReport(
      modelPlaygroundDatabase,
      { projectId: project.id, runId: value.data.runId },
      entities,
      false,
      value.data.explicit,
      { userSave: true },
    );
    if (result.ok && !result.alreadySaved) recordAppAction(actor);
    return result;
  } catch {
    return { ok: false as const, reason: "storage" as const };
  }
}

/** A stored-result read only; the browser uses terminal observations to finalize History. */
export async function readModelPlaygroundRetainedResultAction(input: unknown) {
  const ref = z.object({ projectRef: z.string() }).safeParse(input);
  if (!ref.success) return { ok: false as const, reason: "invalid_input" as const };
  let project: Awaited<ReturnType<typeof requireProjectScope>>;
  try {
    project = await requireProjectScope(await getActionActor(), "read", ref.data.projectRef, {
      type: "project",
    });
  } catch {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const value = z.object({ projectRef: z.string(), runId: z.uuid() }).strict().safeParse(input);
  if (!value.success) return { ok: false as const, reason: "invalid_input" as const };
  const read = await readRetainedModelRun(modelPlaygroundDatabase, {
    projectId: project.id,
    runId: value.data.runId,
  });
  if (!read.ok) return read;
  return {
    ok: true as const,
    terminal: read.terminal,
    readyAt: read.readyAt,
    readyInMs: read.readyInMs,
    columns: read.run.columns.flatMap((column) => {
      if (!column.result) return [];
      const {
        routingAttemptCredentials: _credentials,
        paymentReceipt: _payment,
        rawEvidenceId: _raw,
        ...result
      } = column.result;
      return [{ ...result, paymentReceipt: null, rawEvidenceId: null }];
    }),
  };
}
