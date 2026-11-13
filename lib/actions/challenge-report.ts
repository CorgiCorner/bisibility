"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import type { ReportJson } from "@/lib/agent-reports/model";
import {
  createAgentReport,
  getAgentReport,
  getAgentReportRecord,
  replaceChallengeReportBody,
} from "@/lib/agent-reports/service";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import {
  challengeReportCreateSchema,
  challengeReportLessonsActionSchema,
  challengeReportPreviewSchema,
  challengeReportRefreshSchema,
} from "@/lib/challenge-report/action-input";
import { buildChallengeReport, readChallengeReportDefaults } from "@/lib/challenge-report/build";
import { projectSeoChallengeEnabled } from "@/lib/challenge-report/feature";
import { reportJourney } from "@/lib/challenge-report/journey";
import {
  challengeReportCanRefresh,
  MAX_CHALLENGE_DAYS,
  periodDays,
  utcDateKey,
} from "@/lib/challenge-report/period";
import { type ChallengeReportBody, challengeReportBodySchema } from "@/lib/challenge-report/schema";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

type ChallengeReportResult =
  | { id: string; ok: true }
  | { code: "frozen" | "invalid" | "not_found"; ok: false };

function plainBody(body: ChallengeReportBody) {
  return JSON.parse(JSON.stringify(body)) as Record<string, ReportJson>;
}

function revalidateReport(publicId: string, reportId?: string) {
  const ref = asProjectRef(publicId);
  revalidatePath(appPath(ref, "agent-reports"));
  if (reportId) revalidatePath(appPath(ref, "agent-reports", reportId));
}

async function scope(projectId: string, action: "create" | "update") {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, action, projectId, { type: "project" });
  return { actor, project };
}

function audit(
  actorId: string,
  project: { id: string; publicId: string },
  action: "challenge_report.create" | "challenge_report.lessons" | "challenge_report.refresh",
  after: { days?: number; reportId: string; stage?: string },
) {
  return writeAudit({
    action,
    actorId,
    after,
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });
}

export async function previewChallengeReportAction(input: unknown) {
  const data = parseActionInput(challengeReportPreviewSchema, input);
  const { actor, project } = await scope(data.projectId, "create");
  const report = await reportOptions(data, actor.id, project.id);
  if (!report) return { code: "invalid" as const, ok: false as const };
  const defaults = await readChallengeReportDefaults(project.id);
  const built = await buildChallengeReport({ actorId: actor.id, projectId: project.id, ...report });
  return {
    defaultStart: defaults.defaultStart,
    domain: defaults.domain,
    ok: true as const,
    tiles: (Object.keys(built.tiles) as (keyof typeof built.tiles)[]).map((id) => ({
      id,
      state: built.tiles[id].state,
    })),
  };
}

async function reportOptions(
  data: { start: string; days: number; includeWork?: boolean; journey?: boolean },
  actorId: string,
  projectId: string,
) {
  const journey = data.journey ? await reportJourney(actorId, projectId) : null;
  if (data.journey && !journey) return null;
  const from = journey?.from ?? data.start;
  const days = journey ? periodDays(from, journey.to) : data.days;
  if (from > utcDateKey(new Date()) || days < 1 || days > MAX_CHALLENGE_DAYS) return null;
  return {
    days,
    from,
    work: (journey || (data.includeWork && (await projectSeoChallengeEnabled()))
      ? "project"
      : "hidden") as "project" | "hidden",
    ...(journey ? { journey: journey.journey, snapshotId: journey.snapshotId } : {}),
  };
}

export async function createChallengeReportAction(input: unknown): Promise<ChallengeReportResult> {
  const data = parseActionInput(challengeReportCreateSchema, input);
  const { actor, project } = await scope(data.projectId, "create");
  const options = await reportOptions(data, actor.id, project.id);
  if (!options) return { code: "invalid", ok: false };
  const built = await buildChallengeReport({
    actorId: actor.id,
    ...options,
    projectId: project.id,
  });
  const body = plainBody(built);
  const report = await createAgentReport({
    actorId: actor.id,
    body,
    kind: "challenge_report",
    projectId: project.id,
    requestId: data.requestId,
    provenance: {
      ...(options.snapshotId ? { baselineSnapshotId: options.snapshotId } : {}),
      periodTo: built.period.to,
      source: "challenge_report",
      stage: built.stage,
    },
    title: data.title,
  });
  recordAppAction(actor);
  await audit(actor.id, project, "challenge_report.create", {
    days: built.period.days,
    reportId: report.id,
    stage: built.stage,
  });
  revalidateReport(project.publicId, report.id);
  return { id: report.id, ok: true };
}

export async function refreshChallengeReportAction(input: unknown): Promise<ChallengeReportResult> {
  const data = parseActionInput(challengeReportRefreshSchema, input);
  const { actor, project } = await scope(data.projectId, "update");
  const record = await getAgentReportRecord({ projectId: project.id, reportId: data.reportId });
  const existing = record?.report;
  const parsed =
    existing?.kind === "challenge_report"
      ? challengeReportBodySchema.safeParse(existing.body)
      : null;
  if (existing?.kind !== "challenge_report" || !parsed?.success) {
    return { code: existing ? "invalid" : "not_found", ok: false };
  }
  const baselineSnapshotId = existing.provenance.baselineSnapshotId;
  if (!challengeReportCanRefresh(parsed.data, utcDateKey(new Date()), baselineSnapshotId)) {
    return { code: "frozen", ok: false };
  }
  const built = await buildChallengeReport({
    actorId: record?.actorId ?? "",
    days: parsed.data.period.days,
    from: parsed.data.period.from,
    lessons: parsed.data.lessons,
    work: parsed.data.workScope,
    ...(parsed.data.journey && typeof baselineSnapshotId === "string"
      ? { journey: parsed.data.journey, snapshotId: baselineSnapshotId }
      : {}),
    projectId: project.id,
  });
  const saved = await replaceChallengeReportBody({
    body: plainBody(built),
    expectedBody: existing.body,
    projectId: project.id,
    provenance: {
      ...existing.provenance,
      periodTo: built.period.to,
      source: "challenge_report",
      stage: built.stage,
    },
    reportId: existing.id,
  });
  if (!saved) return { code: "not_found", ok: false };
  recordAppAction(actor);
  await audit(actor.id, project, "challenge_report.refresh", {
    days: built.period.days,
    reportId: saved.id,
    stage: built.stage,
  });
  revalidateReport(project.publicId, saved.id);
  return { id: saved.id, ok: true };
}

export async function saveChallengeReportLessonsAction(
  input: unknown,
): Promise<ChallengeReportResult> {
  const data = parseActionInput(challengeReportLessonsActionSchema, input);
  const { actor, project } = await scope(data.projectId, "update");
  const existing = await getAgentReport({ projectId: project.id, reportId: data.reportId });
  const parsed =
    existing?.kind === "challenge_report"
      ? challengeReportBodySchema.safeParse(existing.body)
      : null;
  if (!existing || !parsed?.success) return { code: existing ? "invalid" : "not_found", ok: false };
  const nextBody = challengeReportBodySchema.safeParse({ ...parsed.data, lessons: data.lessons });
  if (!nextBody.success) return { code: "invalid", ok: false };
  const saved = await replaceChallengeReportBody({
    body: plainBody(nextBody.data),
    expectedBody: existing.body,
    projectId: project.id,
    provenance: existing.provenance,
    reportId: existing.id,
  });
  if (!saved) return { code: "not_found", ok: false };
  recordAppAction(actor);
  await audit(actor.id, project, "challenge_report.lessons", { reportId: saved.id });
  revalidateReport(project.publicId, saved.id);
  return { id: saved.id, ok: true };
}
