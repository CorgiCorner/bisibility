import "server-only";

import { requireApiPublicId } from "@/lib/api/public-id";
import {
  connectionResources,
  eligibleResearchConnections,
  keywordResearchPageProject,
} from "@/lib/keyword-research/context";
import { keywordResearchDefault } from "@/lib/keyword-research/default-scope";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject } from "./_auth";

export async function getKeywordResearchPageContext(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const researchProject = await keywordResearchPageProject(project.id);
  if (!researchProject) {
    throw new Error("Project not found.");
  }

  const defaultResearch = await keywordResearchDefault(researchProject);
  const eligible = eligibleResearchConnections(researchProject, "research");

  return {
    connections: connectionResources(eligible).map((connection) => ({
      ...connection,
      id: requireApiPublicId(connection.id, "conn") as string,
    })),
    defaultDevice: defaultResearch.device,
    defaultScope: defaultResearch.scope,
    project: {
      domain: trackedProjectDomain(project.domain) ?? "",
      id: project.publicId,
      name: project.name,
    },
  };
}
