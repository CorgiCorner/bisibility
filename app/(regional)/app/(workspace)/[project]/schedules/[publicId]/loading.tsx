import {
  loadProjectRunsMessages,
  ProjectRunsFeatureBoundary,
} from "@/components/project-runs/ProjectRunsFeatureBoundary";
import { SchedulePageLoading } from "@/components/schedules/SchedulePageLoading";
import { createIntlTranslator } from "@/i18n/translator.server";
export default async function ScheduleLoading() {
  const runtime = await loadProjectRunsMessages();
  const t = createIntlTranslator(runtime.locale, runtime.messages, runtime);
  return (
    <ProjectRunsFeatureBoundary runtime={runtime}>
      <SchedulePageLoading
        bodyLabel={t("projectRuns.schedules.scheduleEditor")}
        breadcrumbLabel={t("projectRuns.schedules.breadcrumb")}
      />
    </ProjectRunsFeatureBoundary>
  );
}
