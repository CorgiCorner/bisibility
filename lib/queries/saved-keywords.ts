import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { listSavedKeywordRows } from "@/lib/saved-keywords/service";
import { requireReadableProject } from "./_auth";

export async function listSavedKeywords(
  projectId: string,
): Promise<{ rows: SavedKeywordRow[]; total: number }> {
  const { project } = await requireReadableProject(projectId);
  const [rows, total] = await Promise.all([
    listSavedKeywordRows(project.id),
    prisma.savedKeyword.count({ where: { projectId: project.id } }),
  ]);
  return {
    rows,
    total,
  };
}

export async function savedKeywordCount(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  return prisma.savedKeyword.count({ where: { projectId: project.id } });
}
