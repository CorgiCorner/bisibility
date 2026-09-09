import { PageContent } from "@/components/shell/PageContent";

export default function SchedulesLoading() {
  return (
    <PageContent aria-label="Loading schedules" aria-busy="true" className="grid gap-4">
      <div className="h-10 animate-pulse rounded bg-bg-sunken" />
      <div className="h-48 animate-pulse rounded-card bg-bg-sunken" />
    </PageContent>
  );
}
