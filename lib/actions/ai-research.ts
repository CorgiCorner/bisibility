"use server";
import { recordQualifiedUse } from "@/lib/achievements/record-use";
import { listAgentReports } from "@/lib/agent-reports/service";
import { getAiResearchCatalog, getPromptEngineOptions } from "@/lib/ai-research/catalog-service";
import { aiHistoryPayments } from "@/lib/ai-research/history-payment";
import { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import { analyzeAiVisibility, compareAiPrompts } from "@/lib/ai-research/service";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { moduleSupport } from "@/lib/providers/module-support";
import { budgetFailureResult } from "@/lib/rank-check/budget-failure";
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
  try {
    const result = await (mode === "visibility" ? analyzeAiVisibility : compareAiPrompts)(
      { projectId: project.id, actorId: actor.id, origin: APP_REQUEST_ORIGIN },
      { ...data, require_payment: !data.estimate_only },
    );
    recordQualifiedUse({
      actorId: actor.id,
      operation: "runAiResearch",
      estimate: data.estimate_only,
      success: result != null && result.ok !== false,
    });
    return result;
  } catch (error) {
    const budget = budgetFailureResult(error);
    if (budget) return { ok: false as const, reason: budget.code, message: budget.message };
    throw error;
  }
}
export async function getAiResearchPage(projectId: string, mode: "visibility" | "prompt") {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  const history = await listAgentReports({
    projectId: project.id,
    kind: mode === "visibility" ? "ai_visibility" : "prompt_explorer",
    limit: 10,
  });
  const payments = await aiHistoryPayments(
    project.id,
    history.map((row) => row.id),
  );
  const catalogOutcome = await getAiResearchCatalog(project.id);
  const engineOptions = mode === "prompt" ? await getPromptEngineOptions(project.id) : [];
  return {
    engineOptions,
    ...moduleSupport("aiResearch"),
    catalog: catalogOutcome.ok ? catalogOutcome.catalog : undefined,
    catalogError: catalogOutcome.ok ? undefined : catalogOutcome.message,
    catalogFailure: catalogOutcome.ok ? undefined : catalogOutcome.reason,
    domain: trackedProjectDomain(project.domain) ?? "",
    history: history.map((row) => ({
      ...row,
      ...(payments.has(row.id) ? { originalPayment: payments.get(row.id) } : {}),
    })),
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
