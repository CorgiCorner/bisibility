"use server";

import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { isPublicIdOfType } from "@/lib/db/public-id";
import {
  addSetupAcknowledgement,
  parseSetupAcknowledgements,
  SETUP_ACKNOWLEDGEMENT_COOKIE,
  SETUP_ACKNOWLEDGEMENT_MAX_AGE,
  serializeSetupAcknowledgements,
} from "@/lib/getting-started/setup-acknowledgement";
import { resolveSetupProgress } from "@/lib/getting-started/setup-steps";
import { loadSetupContext } from "@/lib/queries/setup-context";
import { cookies } from "next/headers";
import { z } from "zod";

const acknowledgementSchema = z.object({
  projectRef: z.string().refine((value) => isPublicIdOfType(value, "prj"), "Project not found."),
});

export async function acknowledgeGettingStarted(input: unknown): Promise<void> {
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
  if (progress.doneCount !== progress.totalCount) {
    throw new Error("Setup is not complete.");
  }
  const store = await cookies();
  const current = parseSetupAcknowledgements(store.get(SETUP_ACKNOWLEDGEMENT_COOKIE)?.value);
  const next = serializeSetupAcknowledgements(
    addSetupAcknowledgement(current, actor.id, projectRef),
  );
  store.set(SETUP_ACKNOWLEDGEMENT_COOKIE, next, {
    httpOnly: true,
    maxAge: SETUP_ACKNOWLEDGEMENT_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
