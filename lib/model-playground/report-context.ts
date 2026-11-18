import "server-only";
import type { PlaygroundEntity } from "@/lib/ai-research/model-playground-view";
import { type ModelPlaygroundDatabase, queryRows, storeTransaction } from "./store-db";

/** Worker and request finalisation read brands through the same supplied database as the run. */
export function loadModelReportEntities(db: ModelPlaygroundDatabase, projectId: string) {
  return storeTransaction(db, async (tx): Promise<PlaygroundEntity[]> => {
    const [project] = await queryRows<{
      publicId: string;
      name: string;
      domain: string | null;
      brandAliases: string[];
      brandExcludedNames: string[];
    }>(
      tx,
      `SELECT "publicId",name,domain,"brandAliases","brandExcludedNames" FROM projects WHERE id=$1`,
      projectId,
    );
    if (!project) throw new Error("Project not found");
    const competitors = await queryRows<{
      publicId: string;
      label: string | null;
      domain: string;
      aliases: string[];
      excludedNames: string[];
    }>(
      tx,
      `SELECT "publicId",label,domain,aliases,"excludedNames" FROM competitors WHERE "projectId"=$1 ORDER BY domain`,
      projectId,
    );
    return [
      {
        id: project.publicId,
        kind: "project",
        label: project.name,
        domain: project.domain,
        aliases: project.brandAliases,
        excludedNames: project.brandExcludedNames,
      },
      ...competitors.map((row) => ({
        id: row.publicId,
        kind: "competitor" as const,
        label: row.label?.trim() || row.domain,
        domain: row.domain,
        aliases: row.aliases,
        excludedNames: row.excludedNames,
      })),
    ];
  });
}
