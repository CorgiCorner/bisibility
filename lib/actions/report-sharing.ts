"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { readDemoConfig } from "@/lib/demo/config";
import type { ReportShareActionResult } from "@/lib/report-sharing/model";
import { readReportShareSummary } from "@/lib/report-sharing/read";
import {
  createReportShareLink,
  publishReportShareUpdate,
  reissueReportShareToken,
  revokeReportShareLink,
  updateReportShareExpiry,
  updateReportShareSettings,
} from "@/lib/report-sharing/service";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import {
  reportShareCreateSchema,
  reportShareExpirySchema,
  reportSharePublishSchema,
  reportShareSettingsSchema,
  reportShareTargetSchema,
} from "./report-sharing-input";

type ShareAction =
  | "report_share.expiry"
  | "report_share.publish"
  | "report_share.reissue"
  | "report_share.revoke"
  | "report_share.settings"
  | "report_share.update";

async function scope(projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", projectId, { type: "project" });
  return { actor, project };
}

function blocked() {
  return readDemoConfig().kind === "legacy-read-only";
}

function revalidate(publicId: string, reportId: string) {
  const ref = asProjectRef(publicId);
  revalidatePath(appPath(ref, "agent-reports"));
  revalidatePath(appPath(ref, "agent-reports", reportId));
}

async function finish(
  actorId: string,
  project: { id: string; publicId: string },
  action: ShareAction,
  reportId: string,
  after: Record<string, boolean | string>,
): Promise<ReportShareActionResult> {
  const summary = await readReportShareSummary({
    actorId,
    projectId: project.id,
    projectPublicId: project.publicId,
    reportId,
  });
  if (!summary) return { code: "not_found", ok: false };
  await writeAudit({
    action,
    actorId,
    after: { reportId, ...after },
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });
  revalidate(project.publicId, reportId);
  return { ok: true, summary, token: null };
}

export async function publishReportShareAction(input: unknown): Promise<ReportShareActionResult> {
  const { projectId, reportId, expires, ...settings } = parseActionInput(
    reportShareCreateSchema,
    input,
  );
  const { actor, project } = await scope(projectId);
  if (blocked()) return { code: "read_only", ok: false };
  const created = await createReportShareLink({
    actorId: actor.id,
    projectId: project.id,
    reportId,
    settings,
    expires,
  });
  if (!created) return { code: "not_found", ok: false };
  recordAppAction(actor);
  const result = await finish(actor.id, project, "report_share.publish", reportId, {});
  return result.ok ? { ...result, token: created.token } : result;
}

export async function revokeReportShareAction(input: unknown): Promise<ReportShareActionResult> {
  const data = parseActionInput(reportShareTargetSchema, input);
  const { actor, project } = await scope(data.projectId);
  if (blocked()) return { code: "read_only", ok: false };
  const revoked = await revokeReportShareLink({ projectId: project.id, reportId: data.reportId });
  if (!revoked) return { code: "not_found", ok: false };
  recordAppAction(actor);
  return finish(actor.id, project, "report_share.revoke", data.reportId, {});
}

export async function updateReportShareSettingsAction(
  input: unknown,
): Promise<ReportShareActionResult> {
  const data = parseActionInput(reportShareSettingsSchema, input);
  const { actor, project } = await scope(data.projectId);
  if (blocked()) return { code: "read_only", ok: false };
  const settings = await updateReportShareSettings({
    patch: {
      ...(data.noindex === undefined ? {} : { noindex: data.noindex }),
      ...(data.roundNumbers === undefined ? {} : { roundNumbers: data.roundNumbers }),
      ...(data.showBadge === undefined ? {} : { showBadge: data.showBadge }),
      ...(data.showLessons === undefined ? {} : { showLessons: data.showLessons }),
      ...(data.visibleTiles === undefined ? {} : { visibleTiles: data.visibleTiles }),
    },
    projectId: project.id,
    reportId: data.reportId,
  });
  if (!settings) return { code: "not_found", ok: false };
  recordAppAction(actor);
  return finish(actor.id, project, "report_share.settings", data.reportId, {
    noindex: settings.noindex,
    roundNumbers: settings.roundNumbers,
    showBadge: settings.showBadge,
    showLessons: settings.showLessons,
    visibleTiles: settings.visibleTiles.join(","),
  });
}

export async function updateReportShareExpiryAction(
  input: unknown,
): Promise<ReportShareActionResult> {
  const data = parseActionInput(reportShareExpirySchema, input);
  const { actor, project } = await scope(data.projectId);
  if (blocked()) return { code: "read_only", ok: false };
  const choice = await updateReportShareExpiry({
    choice: data.expires,
    projectId: project.id,
    reportId: data.reportId,
  });
  if (!choice) return { code: "not_found", ok: false };
  recordAppAction(actor);
  return finish(actor.id, project, "report_share.expiry", data.reportId, { expires: choice });
}

export async function reissueReportShareAction(input: unknown): Promise<ReportShareActionResult> {
  const data = parseActionInput(reportShareTargetSchema, input);
  const { actor, project } = await scope(data.projectId);
  if (blocked()) return { code: "read_only", ok: false };
  const token = await reissueReportShareToken({ projectId: project.id, reportId: data.reportId });
  if (!token) return { code: "not_found", ok: false };
  recordAppAction(actor);
  const result = await finish(actor.id, project, "report_share.reissue", data.reportId, {});
  return result.ok ? { ...result, token } : result;
}

export async function publishReportShareUpdateAction(
  input: unknown,
): Promise<ReportShareActionResult> {
  const data = parseActionInput(reportSharePublishSchema, input);
  const { actor, project } = await scope(data.projectId);
  if (blocked()) return { code: "read_only", ok: false };
  const published = await publishReportShareUpdate({
    actorId: actor.id,
    mode: data.mode,
    projectId: project.id,
    reportId: data.reportId,
  });
  if (!published) return { code: "not_found", ok: false };
  recordAppAction(actor);
  const result = await finish(actor.id, project, "report_share.update", data.reportId, {
    mode: data.mode,
  });
  return result.ok ? { ...result, token: published.token } : result;
}
