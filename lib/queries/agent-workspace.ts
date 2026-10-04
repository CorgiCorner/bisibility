import "server-only";

import { getAgentReport, listAgentReports } from "@/lib/agent-reports/service";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { getProjectContext } from "@/lib/project-context/service";
import { requireReadableProject } from "./_auth";

export async function getProjectContextPage(projectId: string) {
  const { actor, project } = await requireReadableProject(projectId);
  return {
    context: await getProjectContext(project.id),
    canEdit:
      canProjectAction(getProjectRole(actor, project.id), "update", "project") &&
      !isProjectReadOnly(project.writeMode),
  };
}

export async function getAgentReportsPage(projectId: string, kind?: string) {
  const { actor, project } = await requireReadableProject(projectId);
  return {
    reports: await listAgentReports({ projectId: project.id, kind, limit: 100 }),
    canCreate:
      canProjectAction(getProjectRole(actor, project.id), "create", "project") &&
      !isProjectReadOnly(project.writeMode),
  };
}

export async function getAgentReportPage(projectId: string, reportId: string) {
  const { project } = await requireReadableProject(projectId);
  return getAgentReport({ projectId: project.id, reportId });
}
