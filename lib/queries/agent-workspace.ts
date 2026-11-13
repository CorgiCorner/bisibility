import "server-only";

import { getAgentReport, listAgentReports } from "@/lib/agent-reports/service";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { readChallengeReportDefaults } from "@/lib/challenge-report/build";
import { challengeReportDraftIds } from "@/lib/challenge-report/drafts";
import { reportJourney } from "@/lib/challenge-report/journey";
import { utcDateKey } from "@/lib/challenge-report/period";
import { readProjectChallenge } from "@/lib/challenge-report/project-challenge";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Role } from "@/lib/generated/prisma/client";
import { getProjectContext } from "@/lib/project-context/service";
import { readReportShareSummary, reportAudiences } from "@/lib/report-sharing/read";
import { requireReadableProject } from "./_auth";

function workspacePermissions(role: Role | null | undefined, writeMode: unknown) {
  return {
    canCreate: canProjectAction(role, "create", "project") && !isProjectReadOnly(writeMode),
    canEdit: canProjectAction(role, "update", "project") && !isProjectReadOnly(writeMode),
  };
}

export async function getAgentWorkspacePermissions(projectId: string) {
  const { actor, project } = await requireReadableProject(projectId);
  return workspacePermissions(getProjectRole(actor, project.id), project.writeMode);
}

export async function getProjectContextPage(projectId: string) {
  const { actor, project } = await requireReadableProject(projectId);
  return {
    context: await getProjectContext(project.id),
    canEdit: workspacePermissions(getProjectRole(actor, project.id), project.writeMode).canEdit,
  };
}

export async function getAgentReportsPage(
  projectId: string,
  kind?: string,
  requestedJourney = false,
) {
  const { actor, project } = await requireReadableProject(projectId);
  const reports = await listAgentReports({ projectId: project.id, kind, limit: 100 });
  const challengeIds = reports
    .filter((report) => report.kind === "challenge_report")
    .map((report) => report.id);
  const drafts = await challengeReportDraftIds(project.id, challengeIds, utcDateKey(new Date()));
  const [audiences, shares] = challengeIds.length
    ? await Promise.all([
        reportAudiences(project.id, challengeIds),
        Promise.all(
          challengeIds.map(async (reportId) => {
            const summary = await readReportShareSummary({
              actorId: actor.id,
              projectId: project.id,
              projectPublicId: project.publicId,
              reportId,
            });
            return [reportId, summary] as const;
          }),
        ),
      ])
    : [new Map<string, "link" | "members">(), [] as const];
  const shareByReport = new Map(shares);
  return {
    canCreate: workspacePermissions(getProjectRole(actor, project.id), project.writeMode).canCreate,
    challenge: await readChallengeReportDefaults(project.id),
    journey: requestedJourney ? await reportJourney(actor.id, project.id) : null,
    workAvailable: Boolean(await readProjectChallenge(actor.id, project.id)),
    reports: reports.map((report) => ({
      ...report,
      audience: audiences.get(report.id) ?? "members",
      draft: drafts.has(report.id),
      share: shareByReport.get(report.id) ?? null,
    })),
  };
}

export async function getAgentReportPage(projectId: string, reportId: string) {
  const { project } = await requireReadableProject(projectId);
  return getAgentReport({ projectId: project.id, reportId });
}

export async function getReportShareSummary(projectId: string, reportId: string) {
  const { actor, project } = await requireReadableProject(projectId);
  return readReportShareSummary({
    actorId: actor.id,
    projectId: project.id,
    projectPublicId: project.publicId,
    reportId,
  });
}
