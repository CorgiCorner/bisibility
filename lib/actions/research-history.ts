"use server";

import { readModelPlaygroundHistory } from "@/lib/ai-research/model-playground-history";
import {
  openStoredKeywordResearch,
  readKeywordResearchHistory,
} from "@/lib/keyword-research/history";
import { readPlaygroundHistory } from "@/lib/provider-comparison/playground-history";
import { historyRequestSchema, storedResearchSchema } from "@/lib/research-history/input";
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
