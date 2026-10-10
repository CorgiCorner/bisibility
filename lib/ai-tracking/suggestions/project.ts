import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import { requirePublicId } from "@/lib/db/public-id-resources";
import { getProjectContext } from "@/lib/project-context/service";
import { getCompetitorsApiViewFor } from "@/lib/queries/competitors";
import { contextSuggestions } from "./context";
export async function projectContextSuggestions(
  actor: Actor,
  project: { id: string; publicId: string; domain: string | null },
) {
  const [context, competitors] = await Promise.all([
    getProjectContext(project.id),
    getCompetitorsApiViewFor(actor, project.publicId),
  ]);
  const { updatedAt, ...contextFields } = context;
  const inputSnapshot = {
    context: contextFields,
    competitors: competitors.managedCompetitors.map((competitor) => ({
      id: requirePublicId(competitor.id, "cmp"),
      label: competitor.label,
      domain: competitor.domain,
    })),
  };
  const offering = context.products || context.business;
  if (!offering.trim())
    return {
      drafts: [],
      method: "manual_fallback",
      inputSnapshot,
      contextUpdatedAt: updatedAt,
      requiresAcceptance: true,
      costUsd: "0",
      limitations: [
        "Add project context or enter prompts manually. No model generation or paid baseline is started.",
      ],
    };
  const drafts = contextSuggestions({
    brand: project.domain ?? "this business",
    offering,
    competitors: competitors.managedCompetitors.map(
      (competitor) => competitor.label ?? competitor.domain,
    ),
  });
  return {
    drafts,
    method: "context_template_heuristic",
    inputSnapshot,
    contextUpdatedAt: updatedAt,
    requiresAcceptance: true,
    costUsd: "0",
    limitations: [
      "Templates are hypotheses, not measured demand or provider datasets",
      "No model generation was requested; review and edit before acceptance",
    ],
  };
}
