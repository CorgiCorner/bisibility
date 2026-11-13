"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { manualReportSchema } from "@/lib/agent-reports/manual-model";
import { externalAgentReportSchema } from "@/lib/agent-reports/model";
import { createAgentReport } from "@/lib/agent-reports/service";
import { projectContextActionSchema } from "@/lib/project-context/model";
import { saveProjectContext } from "@/lib/project-context/service";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

export async function saveProjectContextAction(input: unknown) {
  const { projectId, ...data } = parseActionInput(projectContextActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", projectId, { type: "project" });
  const result = await saveProjectContext(project.id, data);
  recordAppAction(actor);
  revalidatePath(appPath(asProjectRef(project.publicId), "context"));

  return result;
}

const createReportActionSchema = externalAgentReportSchema.extend({
  projectId: z.string().trim().min(1).max(120),
});

export async function createAgentReportAction(input: unknown) {
  const { projectId, ...data } = parseActionInput(createReportActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
  const report = await createAgentReport({ ...data, projectId: project.id, actorId: actor.id });
  recordAppAction(actor);
  revalidatePath(appPath(asProjectRef(project.publicId), "agent-reports"));

  return report;
}

const manualReportActionSchema = manualReportSchema.extend({
  projectId: z.string().trim().min(1).max(120),
  requestId: z.uuid().optional(),
});

export async function saveManualAgentReportAction(input: unknown) {
  const { projectId, title, analysis, requestId } = parseActionInput(
    manualReportActionSchema,
    input,
  );
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
  const report = await createAgentReport({
    actorId: actor.id,
    projectId: project.id,
    requestId,
    title,
    kind: "manual_analysis",
    body: { analysis },
    provenance: { source: "project_member" },
  });
  recordAppAction(actor);
  revalidatePath(appPath(asProjectRef(project.publicId), "agent-reports"));
  return report;
}
