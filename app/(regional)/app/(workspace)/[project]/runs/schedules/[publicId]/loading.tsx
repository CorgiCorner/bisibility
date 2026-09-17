import {
  loadProjectRunsMessages,
  ProjectRunsFeatureBoundary,
} from "@/components/project-runs/ProjectRunsFeatureBoundary";
import { ScheduleObjectFrame } from "@/components/schedules/ScheduleObjectFrame";
import { createIntlTranslator } from "@/i18n/translator.server";

export default async function ScheduleLoading() {
  const runtime = await loadProjectRunsMessages();
  const t = createIntlTranslator(runtime.locale, runtime.messages, runtime);
  return (
    <ProjectRunsFeatureBoundary runtime={runtime}>
      <ScheduleObjectFrame
        bodyLabel={t("projectRuns.schedules.scheduleEditor")}
        breadcrumbLabel={t("projectRuns.schedules.breadcrumb")}
        breadcrumb={{
          href: "../",
          label: <span className="block h-4 w-28 animate-pulse rounded bg-bg-sunken" />,
        }}
        title={t("projectRuns.schedules.schedule")}
      />
    </ProjectRunsFeatureBoundary>
  );
}
