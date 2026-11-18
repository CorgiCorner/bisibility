"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { captureProjectWork } from "@/lib/challenge-report/capture-project-work";
import { projectPagesListInput } from "@/lib/pages/list-input";
import { projectPagesLoadSchema } from "@/lib/pages/list-schema";
import { getProjectPagesList } from "@/lib/pages/queries";
import { addManualProjectPages, syncProjectPages } from "@/lib/pages/sync";
import { appPath } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const projectSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
});

const manualSchema = projectSchema.extend({
  text: z.string().max(100_000),
});

const MANUAL_LINE_LIMIT = 500;
const TOO_MANY_LINES = "Paste at most 500 lines.";

function revalidatePages(publicId: string) {
  revalidatePath(appPath(publicId, "pages"));
}

/** On-demand page registry refresh. */
export async function refreshProjectPagesAction(input: unknown) {
  const data = parseActionInput(projectSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const result = await syncProjectPages(project.id, { now: new Date() });
  if (result.status === "ok") {
    recordAppAction(actor);
    revalidatePages(project.publicId);
  }
  return result;
}

/** One server page of the project URL registry. */
export async function loadProjectPagesAction(input: unknown) {
  const data = parseActionInput(projectPagesLoadSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "read",
    data.projectId,
    { type: "project" },
    {
      allowReadOnly: true,
    },
  );
  return getProjectPagesList(project.id, projectPagesListInput(data));
}

/** Adds pasted URLs or paths. More than 500 lines is rejected before the registry write. */
export async function addManualProjectPagesAction(input: unknown) {
  const data = parseActionInput(manualSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const lines = data.text.split(/\r?\n/);
  if (lines.length > MANUAL_LINE_LIMIT) {
    return {
      added: 0,
      existing: 0,
      rejected: [{ line: MANUAL_LINE_LIMIT + 1, reason: TOO_MANY_LINES, value: "" }],
    };
  }
  const result = await addManualProjectPages(project.id, [data.text], actor);
  if (result.added > 0) {
    recordAppAction(actor);
    captureProjectWork(actor.id, project.id);
    revalidatePages(project.publicId);
  }
  return result;
}
