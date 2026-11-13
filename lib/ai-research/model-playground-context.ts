import type {
  PlaygroundEntity,
  PlaygroundSourceOverride,
  PlaygroundTopic,
} from "@/lib/ai-research/model-playground-view";
import { type SourceOverrideType, sourceOverrideTypes } from "@/lib/ai-tracking/source-types";
import { prisma } from "@/lib/db/prisma";
import "server-only";

export type ModelPlaygroundContext = {
  entities: PlaygroundEntity[];
  projectName: string;
  sourceOverrides: PlaygroundSourceOverride[];
  topics: PlaygroundTopic[];
};

function sourceOverride(type: string): SourceOverrideType | null {
  return sourceOverrideTypes.find((item) => item === type) ?? null;
}

/** Project, competitors, topics and source types for one playground comparison. */
export async function loadModelPlaygroundContext(
  projectId: string,
): Promise<ModelPlaygroundContext> {
  const [project, competitors, topics, overrides] = await Promise.all([
    prisma.project.findUnique({
      select: {
        brandAliases: true,
        brandExcludedNames: true,
        domain: true,
        name: true,
        publicId: true,
      },
      where: { id: projectId },
    }),
    prisma.competitor.findMany({
      orderBy: { domain: "asc" },
      select: { aliases: true, domain: true, excludedNames: true, label: true, publicId: true },
      where: { projectId },
    }),
    prisma.aiTopic.findMany({
      orderBy: { name: "asc" },
      select: { name: true, publicId: true },
      take: 30,
      where: { archivedAt: null, pausedAt: null, projectId },
    }),
    prisma.aiSourceTypeOverride.findMany({
      select: { domain: true, type: true },
      where: { projectId },
    }),
  ]);
  if (!project) throw new Error("Project not found.");
  return {
    entities: [
      {
        aliases: project.brandAliases,
        domain: project.domain,
        excludedNames: project.brandExcludedNames,
        id: project.publicId,
        kind: "project",
        label: project.name,
      },
      ...competitors.map((competitor) => ({
        aliases: competitor.aliases,
        domain: competitor.domain,
        excludedNames: competitor.excludedNames,
        id: competitor.publicId,
        kind: "competitor" as const,
        label: competitor.label?.trim() || competitor.domain,
      })),
    ],
    projectName: project.name,
    sourceOverrides: overrides.flatMap((row) => {
      const type = sourceOverride(row.type);
      return type ? [{ domain: row.domain, type }] : [];
    }),
    topics: topics.map((topic) => ({ id: topic.publicId, name: topic.name })),
  };
}
