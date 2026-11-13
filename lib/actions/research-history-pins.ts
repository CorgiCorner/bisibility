"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { historyPinSchema } from "@/lib/research-history/input";
import { pinResearchHistory, unpinResearchHistory } from "@/lib/research-history/pins";
import { getActionActor, requireProjectScope } from "./_shared";

async function pinScope(input: unknown) {
  const value = historyPinSchema.parse(input);
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "update",
    value.projectRef,
    {
      type: "project_surface_preference",
    },
    { allowReadOnly: true },
  );
  return {
    actor,
    itemKey: value.itemKey,
    projectId: project.id,
    surface: value.surface,
    userId: actor.id,
  };
}

export async function pinResearchHistoryAction(input: unknown) {
  try {
    const scope = await pinScope(input);
    const { actor, ...pin } = scope;
    await pinResearchHistory(pin);
    recordAppAction(actor);
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export async function unpinResearchHistoryAction(input: unknown) {
  try {
    const scope = await pinScope(input);
    const { actor, ...pin } = scope;
    await unpinResearchHistory(pin);
    recordAppAction(actor);
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}
