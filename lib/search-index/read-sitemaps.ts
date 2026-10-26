import "server-only";
import { refreshInspectionCandidates } from "@/lib/presence/candidates";
import { connectionForProject, listSearchIndexSitemaps } from "./service";

/** Refresh discovery only. This never inspects URLs or reserves an inspection allowance. */
export async function readProjectSitemaps(projectId: string, now = new Date()) {
  const { property } = await connectionForProject(projectId);
  let listed = false;
  await refreshInspectionCandidates({
    projectId,
    property,
    now,
    runDeadline: Date.now() + 15_000,
    listSitemaps: async () => {
      const result = await listSearchIndexSitemaps(projectId);
      if (result.property !== property) throw new Error("Search Console property changed");
      listed = true;
      return result.sitemaps;
    },
  });
  if (!listed) throw new Error("Sitemaps could not be read");
}
