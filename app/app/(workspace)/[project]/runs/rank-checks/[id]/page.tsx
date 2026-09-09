import { RunPage } from "@/components/rank-runs/RunPage";
import { PageContent } from "@/components/shell/PageContent";
import { ApiNotFoundError } from "@/lib/api/errors";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getRankCheckRun, listRankCheckRunItems } from "@/lib/queries/rank-check-runs";
import { notFound } from "next/navigation";

type RankCheckRunPageProps = {
  params: Promise<{ id: string; project: string }>;
};

function itemsUrl(projectRef: string) {
  return new URL(`https://example.com/api/rank-check-runs?project=${projectRef}&limit=20`);
}

export default async function RankCheckRunPage({ params }: Readonly<RankCheckRunPageProps>) {
  const { id, project } = await params;
  if (!isPublicIdOfType(id, "rcr")) notFound();
  const access = await resolveProjectAccess(project);
  const readable = await requireReadableProject(access.publicId);
  try {
    const [run, items] = await Promise.all([
      getRankCheckRun(access.projectId, id),
      listRankCheckRunItems(access.projectId, id, itemsUrl(access.publicId)),
    ]);
    const canMutate =
      canProjectAction(getProjectRole(readable.actor, readable.project.id), "update", "keyword") &&
      !isProjectReadOnly(readable.project.writeMode);
    return (
      <PageContent>
        <RunPage
          canMutate={canMutate}
          items={items.data}
          nextCursor={items.nextCursor}
          now={new Date().toISOString()}
          projectRef={access.publicId}
          run={run}
        />
      </PageContent>
    );
  } catch (error) {
    if (error instanceof ApiNotFoundError) notFound();
    throw error;
  }
}
