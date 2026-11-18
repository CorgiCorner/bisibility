"use server";
import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { canWriteAiTracking } from "@/lib/ai-tracking/projections/schedule-list";
import { getProjectRole } from "@/lib/auth/authorize";
import { modelPlaygroundDatabase } from "@/lib/model-playground/database";
import { trackModelPlaygroundWithPromptStore } from "@/lib/model-playground/track-prompt-store";
import { trackRequestSchema } from "@/lib/model-playground/track-request";
import { z } from "zod";

export async function trackModelPlaygroundAction(input: unknown) {
  const ref = z.object({ projectRef: z.string() }).safeParse(input);
  if (!ref.success) return { ok: false as const, reason: "invalid_input" as const };
  let project: Awaited<ReturnType<typeof requireProjectScope>>;
  let actor: Awaited<ReturnType<typeof getActionActor>>;
  try {
    actor = await getActionActor();
    project = await requireProjectScope(actor, "update", ref.data.projectRef, { type: "project" });
    if (!canWriteAiTracking(getProjectRole(actor, project.id), project.writeMode))
      return { ok: false as const, reason: "forbidden" as const };
  } catch {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const value = trackRequestSchema.safeParse(input);
  if (!value.success) return { ok: false as const, reason: "invalid_input" as const };
  return trackModelPlaygroundWithPromptStore(
    modelPlaygroundDatabase,
    { projectId: project.id, runId: value.data.runId, topicId: value.data.topicId },
    () => recordAppAction(actor),
  );
}
