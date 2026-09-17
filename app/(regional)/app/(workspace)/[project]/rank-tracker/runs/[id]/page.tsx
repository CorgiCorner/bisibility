import { isPublicIdOfType } from "@/lib/db/public-id";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { projectRunRankCheckPath, projectRunsPath } from "@/lib/routing/project-runs-path";
import { permanentRedirect } from "next/navigation";

type RankRunDetailPageProps = {
  params: Promise<{ id: string; project: string }>;
};

export default async function RankRunDetailPage({ params }: Readonly<RankRunDetailPageProps>) {
  const { id, project } = await params;
  const { publicId: projectRef } = await resolveProjectAccess(project);
  permanentRedirect(
    isPublicIdOfType(id, "rcr")
      ? projectRunRankCheckPath(projectRef, id)
      : projectRunsPath(projectRef, { source: "rank_checks" }),
  );
}
