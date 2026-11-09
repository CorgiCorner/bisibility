"use server";
import { withAchievementUse } from "@/lib/achievements/record-use";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { withCapacityFailure } from "@/lib/capacity/action";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import {
  cancelSiteAuditRun,
  listSiteAuditRunPages,
  resumeSiteAuditRun,
} from "@/lib/site-audit/runs";
import { siteAuditActionSchema, siteAuditPagesQuery } from "@/lib/site-audit/schema";
import { listSiteAudits, readSiteAudit, runSiteAudit } from "@/lib/site-audit/service";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const historySchema = z.object({ projectId: z.string().min(1).max(120) });
const readSchema = historySchema.extend({ reportId: z.string().min(1).max(120) });
const pagesSchema = readSchema.extend(siteAuditPagesQuery.shape).strict();
export async function runSiteAuditAction(input: unknown) {
  const { projectId, ...options } = parseActionInput(siteAuditActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
  return withCapacityFailure(async () => {
    const result = await withAchievementUse(actor.id, "runSiteAudit", false, () =>
      runSiteAudit({ actor, actorId: actor.id, project }, options),
    );
    if (!result.cached) recordAppAction(actor);
    return result;
  });
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
  return withAchievementUse(actor.id, "getSiteAudit", false, () =>
    readSiteAudit(project.id, reportId),
  );
}
export async function cancelSiteAuditAction(input: unknown) {
  const { projectId, reportId } = parseActionInput(readSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
  const result = await cancelSiteAuditRun(project.id, reportId, { actorId: actor.id });
  recordAppAction(actor);
  return result;
}
export async function resumeSiteAuditAction(input: unknown) {
  const { projectId, reportId } = parseActionInput(readSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
  assertProjectWritable(project);
  return withCapacityFailure(async () => {
    const result = await resumeSiteAuditRun(project.id, reportId, { actorId: actor.id });
    recordAppAction(actor);
    return result;
  });
}
export async function listSiteAuditPagesAction(input: unknown) {
  const { projectId, reportId, offset, limit } = parseActionInput(pagesSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  return listSiteAuditRunPages(project.id, reportId, offset, limit);
}
