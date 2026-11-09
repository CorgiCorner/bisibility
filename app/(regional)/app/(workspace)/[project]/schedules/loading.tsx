import { ProjectRunsFeatureBoundary } from "@/components/project-runs/ProjectRunsFeatureBoundary";
import { ProjectRunsLoading } from "@/components/project-runs/ProjectRunsLoading";

export default async function SchedulesLoading() {
  return (
    <ProjectRunsFeatureBoundary>
      <ProjectRunsLoading active="schedules" />
    </ProjectRunsFeatureBoundary>
  );
}
