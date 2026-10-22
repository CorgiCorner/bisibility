import { AiRunResults } from "@/components/project-runs/AiRunResults";
import { ProjectRunsFeatureBoundary } from "@/components/project-runs/ProjectRunsFeatureBoundary";
import { PageContent } from "@/components/shell/PageContent";
import { asProjectRef } from "@/lib/routing/app-path";
import { projectRunAiPath, projectRunsPath } from "@/lib/routing/project-runs-path";
import { loadAiRunResults } from "@/lib/runs/ai-run-results";
import { notFound } from "next/navigation";

export default async function AiRunResultsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string; runId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}>) {
  const [{ project, runId }, query] = await Promise.all([params, searchParams]);
  const result = await loadAiRunResults(project, runId, query.cursor);
  if (!result) notFound();
  const ref = asProjectRef(result.run.project.publicId);
  const nextHref = result.nextCursor
    ? `${projectRunAiPath(ref, runId)}?${new URLSearchParams({ cursor: result.nextCursor })}`
    : null;
  return (
    <ProjectRunsFeatureBoundary>
      <PageContent>
        <AiRunResults {...result} backHref={projectRunsPath(ref)} nextHref={nextHref} />
      </PageContent>
    </ProjectRunsFeatureBoundary>
  );
}
