"use server";
import { listAgentReports } from "@/lib/agent-reports/service";
import { getAiResearchCatalog } from "@/lib/ai-research/catalog-service";
import { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import { analyzeAiVisibility, compareAiPrompts } from "@/lib/ai-research/service";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { getActionActor, requireProjectScope } from "./_shared";

export async function analyzeAiResearchAction(
  projectId: string,
  mode: "visibility" | "prompt",
  input: unknown,
) {
  const data = (mode === "visibility" ? visibilitySchema : promptSchema).parse(input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
  return (mode === "visibility" ? analyzeAiVisibility : compareAiPrompts)(
    { projectId: project.id, actorId: actor.id, origin: APP_REQUEST_ORIGIN },
    data,
  );
}
export async function getAiResearchPage(projectId: string, mode: "visibility" | "prompt") {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  const history = await listAgentReports({
    projectId: project.id,
    kind: mode === "visibility" ? "ai_visibility" : "prompt_explorer",
    limit: 10,
  });
  const catalogOutcome = await getAiResearchCatalog(project.id);
  return {
    catalog: catalogOutcome.ok ? catalogOutcome.catalog : undefined,
    catalogError: catalogOutcome.ok ? undefined : catalogOutcome.message,
    domain: trackedProjectDomain(project.domain) ?? "",
    history,
    canRun:
      canProjectAction(getProjectRole(actor, project.id), "create", "project") &&
      !isProjectReadOnly(project.writeMode),
  };
}

export async function getAiResearchCatalogAction(projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  return getAiResearchCatalog(project.id);
}
