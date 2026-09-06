import { RunPage } from "@/components/rank-runs/RunPage";
import { PageContent } from "@/components/shell/PageContent";
import { ApiNotFoundError } from "@/lib/api/errors";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getRankCheckRun, listRankCheckRunItems } from "@/lib/queries/rank-check-runs";
import { notFound } from "next/navigation";

type RankRunDetailPageProps = {
  params: Promise<{ id: string; project: string }>;
};

export default async function RankRunDetailPage({ params }: Readonly<RankRunDetailPageProps>) {
  const { id, project } = await params;
  const { publicId: projectRef } = await resolveProjectAccess(project);
  const readable = await requireReadableProject(projectRef);
  const itemsUrl = new URL("https://example.com/api/rank-check-runs/items?limit=50");
  let run: Awaited<ReturnType<typeof getRankCheckRun>>;
  let itemPage: Awaited<ReturnType<typeof listRankCheckRunItems>>;
  try {
    [run, itemPage] = await Promise.all([
      getRankCheckRun(readable.project.id, id),
      listRankCheckRunItems(readable.project.id, id, itemsUrl),
    ]);
  } catch (error) {
    if (error instanceof ApiNotFoundError) notFound();
    throw error;
  }
  const role = getProjectRole(readable.actor, readable.project.id);

  return (
    <PageContent>
      <RunPage
        canMutate={canProjectAction(role, "update", "keyword")}
        items={itemPage.data}
        nextCursor={itemPage.nextCursor}
        now={new Date().toISOString()}
        projectRef={projectRef}
        run={run}
      />
    </PageContent>
  );
}
