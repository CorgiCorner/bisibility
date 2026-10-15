import { ProjectRunsLoadingTabs } from "@/components/project-runs/ProjectRunsLoading";
import { ScheduleEditorLoadingContent } from "@/components/schedules/ScheduleEditorLoadingContent";
import { ScheduleObjectFrame } from "@/components/schedules/ScheduleObjectFrame";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <span
      className={cn(
        "block max-w-full rounded-control bg-bg-sunken motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
export function SchedulePageLoading({
  bodyLabel,
  breadcrumbLabel,
}: Readonly<{ bodyLabel: string; breadcrumbLabel: string }>) {
  return (
    <ScheduleObjectFrame
      pending
      bodyLabel={bodyLabel}
      breadcrumbLabel={breadcrumbLabel}
      breadcrumb={{
        href: "../",
        label: <Bar className="h-[1lh] w-28" />,
      }}
      navigation={<ProjectRunsLoadingTabs active="schedules" />}
      subtitle={<Bar className="h-[1lh] w-64 max-w-full" />}
      title={<Bar className="h-[1lh] w-56 max-w-full" />}
    >
      <ScheduleEditorLoadingContent />
    </ScheduleObjectFrame>
  );
}
