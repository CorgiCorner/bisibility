import "server-only";
import { getActionActor } from "@/lib/actions/_shared";
import { listAgentReports } from "@/lib/agent-reports/service";
import type { AnswerHighlightEntity } from "@/lib/ai-tracking/answer-highlight";
import { loadProjectEngineChoice } from "@/lib/ai-tracking/queries/project-engines";
import { trackingSelectionEstimateUsd } from "@/lib/ai-tracking/tracking-engine-prices";
import { trackingScope } from "@/lib/api/ai-tracking-service";
import { prisma } from "@/lib/db/prisma";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import type { ResearchTabContext } from "./research-tab-model";

/** Current names, enabled engines and recent question lookups for the Research tab. */
export async function loadResearchTabContext(projectRef: string): Promise<ResearchTabContext> {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectRef);
  const [row, competitors, engines, recent] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      select: {
        brandAliases: true,
        brandExcludedNames: true,
        domain: true,
        name: true,
        publicId: true,
      },
      where: { id: project.id },
    }),
    prisma.competitor.findMany({
      orderBy: [{ domain: "asc" }, { publicId: "asc" }],
      select: { aliases: true, domain: true, excludedNames: true, label: true, publicId: true },
      where: { projectId: project.id },
    }),
    loadProjectEngineChoice(project.id),
    listAgentReports({ kind: "prompt_research", limit: 8, projectId: project.id }),
  ]);
  const engineIds = [...new Set(engines.enabledEngines.map((item) => item.engine))];
  const entities: AnswerHighlightEntity[] = [
    {
      id: row.publicId,
      kind: "project",
      label: row.name,
      names: {
        aliases: row.brandAliases,
        domain: row.domain,
        excludedNames: row.brandExcludedNames,
        label: row.name,
      },
    },
    ...competitors.map((item) => ({
      id: item.publicId,
      kind: "competitor" as const,
      label: item.label?.trim() || item.domain,
      names: {
        aliases: item.aliases,
        domain: item.domain,
        excludedNames: item.excludedNames,
        label: item.label,
      },
    })),
  ];
  return {
    competitors: competitors.map((item) => ({ label: item.label?.trim() || item.domain })),
    competitorsHref: appPath(asProjectRef(projectRef), "settings", "competitors"),
    dailyUsdPerPrompt: trackingSelectionEstimateUsd(engineIds),
    engines: engineIds,
    entities,
    recent: recent.map((item) => ({
      createdAt: item.createdAt,
      id: item.id,
      title: item.title,
    })),
  };
}
