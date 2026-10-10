import "server-only";

import { getAgentReport, listAgentReports } from "@/lib/agent-reports/service";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Role } from "@/lib/generated/prisma/client";
import { getProjectContext } from "@/lib/project-context/service";
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

export async function getAgentReportsPage(projectId: string, kind?: string) {
  const { actor, project } = await requireReadableProject(projectId);
  return {
    reports: await listAgentReports({ projectId: project.id, kind, limit: 100 }),
    canCreate: workspacePermissions(getProjectRole(actor, project.id), project.writeMode).canCreate,
  };
}

export async function getAgentReportPage(projectId: string, reportId: string) {
  const { project } = await requireReadableProject(projectId);
  return getAgentReport({ projectId: project.id, reportId });
}
