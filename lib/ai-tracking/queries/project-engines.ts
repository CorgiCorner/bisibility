import {
  DEFAULT_PROJECT_ENGINE,
  type ProjectEngineChoice,
  projectEngineSelection,
} from "@/lib/ai-tracking/project-engine-set";
import { prisma } from "@/lib/db/prisma";

const engineSelect = { enabled: true, engine: true, source: true } as const;

/** The project's enabled engines, or the historical drawer default when nothing is stored. */
export async function loadProjectEngineChoice(projectId: string): Promise<{
  enabledEngines: ProjectEngineChoice[];
  engineDefault: ProjectEngineChoice;
}> {
  const rows = await prisma.aiProjectEngine.findMany({
    select: engineSelect,
    where: { projectId },
  });
  const selection = projectEngineSelection(rows);
  return {
    enabledEngines: selection.enabled,
    engineDefault: selection.enabled[0] ?? DEFAULT_PROJECT_ENGINE,
  };
}
