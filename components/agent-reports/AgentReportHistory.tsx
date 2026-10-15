import { Card } from "@/components/ui/Card";
import type { AgentReportSummary } from "@/lib/agent-reports/model";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";

export function AgentReportHistory({
  reports,
  projectRef,
  locale,
  timeZone,
}: Readonly<{
  reports: readonly AgentReportSummary[];
  projectRef: ProjectRef;
  locale: string;
  timeZone: string;
}>) {
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone });
  return (
    <Card className="divide-y divide-border overflow-hidden p-0">
      {reports.map((report) => (
        <Link
          className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3 first:rounded-t-card last:rounded-b-card outline-none hover:bg-bg-sunken focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-solid"
          href={appPath(projectRef, "agent-reports", report.id)}
          key={report.id}
        >
          <div className="min-w-0 flex-1">
            <h2 className="m-0 break-words text-[13px] font-medium leading-snug">{report.title}</h2>
            <p className="mb-0 mt-1 text-[11px] text-fg-muted">{report.kind.replace(/_/g, " ")}</p>
          </div>
          <time
            className="shrink-0 text-[12px] tabular-nums text-fg-muted"
            dateTime={report.createdAt}
          >
            {dateFormat.format(new Date(report.createdAt))}
          </time>
        </Link>
      ))}
    </Card>
  );
}
