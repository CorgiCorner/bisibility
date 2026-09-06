import { ScheduleObjectFrame } from "@/components/schedules/ScheduleObjectFrame";

export default function SchedulesLoading() {
  return (
    <ScheduleObjectFrame
      bodyLabel="Schedules body"
      breadcrumb={{
        href: "../",
        label: <span className="block h-4 w-24 animate-pulse rounded bg-bg-sunken" />,
      }}
      title="Schedules"
    />
  );
}
