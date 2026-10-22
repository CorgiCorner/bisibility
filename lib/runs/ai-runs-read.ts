import "server-only";
import { prisma } from "@/lib/db/prisma";
import { aiProjectRun, aiRunSelect } from "./ai-project-run";
import { aiRunSummaries } from "./ai-run-summary";
import { aiStatusWhere } from "./ai-status-where";
import type { ProjectRunsSortTuple } from "./cursor";
import type { ProjectRunsQuery } from "./filters";
import type { ProjectRunsPresentationProject } from "./project-runs-presentation";

export async function readAiRunRows(
  project: ProjectRunsPresentationProject,
  query: ProjectRunsQuery,
  cursor: ProjectRunsSortTuple | null,
) {
  const where = { projectId: project.id, ...aiStatusWhere(query.status) };
  const after = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.sortAt) } },
          ...(cursor.kind === "ai"
            ? [{ createdAt: new Date(cursor.sortAt), publicId: { gt: cursor.id } }]
            : []),
        ],
      }
    : {};
  const [rows, count] = await Promise.all([
    prisma.aiTrackingRun.findMany({
      select: aiRunSelect,
      where: { AND: [where, after] },
      orderBy: [{ createdAt: "desc" }, { publicId: "asc" }],
      take: query.limit + 1,
    }),
    prisma.aiTrackingRun.count({ where }),
  ]);
  const summaries = await aiRunSummaries(
    project.id,
    rows.map((row) => row.id),
  );
  return {
    count,
    runs: rows.map((row) =>
      aiProjectRun(
        row,
        project,
        summaries.find((summary) => summary.runId === row.id),
      ),
    ),
  };
}
