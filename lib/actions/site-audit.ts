"use server";

import { siteAuditActionSchema } from "@/lib/site-audit/schema";
import { listSiteAudits, readSiteAudit, runSiteAudit } from "@/lib/site-audit/service";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const historySchema = z.object({ projectId: z.string().min(1).max(120) });
const readSchema = historySchema.extend({ reportId: z.string().min(1).max(120) });
export async function runSiteAuditAction(input: unknown) {
  const { projectId, ...options } = parseActionInput(siteAuditActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
  return runSiteAudit({ actor, actorId: actor.id, project }, options);
}
export async function listSiteAuditsAction(input: unknown) {
  const { projectId } = parseActionInput(historySchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  return listSiteAudits(project.id);
}
export async function readSiteAuditAction(input: unknown) {
  const { projectId, reportId } = parseActionInput(readSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  return readSiteAudit(project.id, reportId);
}
