import { ScheduleObjectFrame } from "@/components/schedules/ScheduleObjectFrame";

export default function ScheduleLoading() {
  return (
    <ScheduleObjectFrame
      bodyLabel="Schedule editor body"
      breadcrumb={{
        href: "../",
        label: <span className="block h-4 w-28 animate-pulse rounded bg-bg-sunken" />,
      }}
      title="Schedule"
    />
  );
}
