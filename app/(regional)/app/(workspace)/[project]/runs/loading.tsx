import { ProjectRunsFeatureBoundary } from "@/components/project-runs/ProjectRunsFeatureBoundary";
import { ProjectRunsLoading } from "@/components/project-runs/ProjectRunsLoading";

export default async function RunsLoading() {
  return (
    <ProjectRunsFeatureBoundary>
      <ProjectRunsLoading />
    </ProjectRunsFeatureBoundary>
  );
}
