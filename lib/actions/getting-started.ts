"use server";

import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { isPublicIdOfType } from "@/lib/db/public-id";
import type { AcknowledgeGettingStartedResult } from "@/lib/getting-started/acknowledge-result";
import {
  markSetupAcknowledged,
  SETUP_ACKNOWLEDGEMENT_COOKIE,
} from "@/lib/getting-started/setup-acknowledgement";
import { isSetupComplete, resolveSetupProgress } from "@/lib/getting-started/setup-steps";
import { loadSetupContext } from "@/lib/queries/setup-context";
import { cookies } from "next/headers";
import { z } from "zod";

const acknowledgementSchema = z.object({
  projectRef: z.string().refine((value) => isPublicIdOfType(value, "prj"), "Project not found."),
});

export async function acknowledgeGettingStarted(
  input: unknown,
): Promise<AcknowledgeGettingStartedResult> {
  const { projectRef } = acknowledgementSchema.parse(input);
  const actor = await getActionActor();
  await requireProjectScope(
    actor,
    "read",
    projectRef,
    { type: "project" },
    { allowReadOnly: true },
  );
  const progress = resolveSetupProgress(await loadSetupContext(projectRef));
  if (!isSetupComplete(progress.steps)) {
    return { ok: false, reason: "incomplete" };
  }
  try {
    await markSetupAcknowledged(actor.id, projectRef);
  } catch (error) {
    console.error("[getting-started] Failed to persist setup acknowledgement.", error);
    return { ok: false, reason: "write_failed" };
  }
  const store = await cookies();
  store.delete(SETUP_ACKNOWLEDGEMENT_COOKIE);
  return { ok: true };
}
