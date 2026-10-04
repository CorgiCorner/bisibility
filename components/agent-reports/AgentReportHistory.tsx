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
    <Card className="divide-y divide-border p-0">
      {reports.map((report) => (
        <Link
          className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-bg-sunken"
          href={appPath(projectRef, "agent-reports", report.id)}
          key={report.id}
        >
          <div className="min-w-0">
            <h2 className="break-words text-[14px] font-semibold">{report.title}</h2>
            <p className="mt-1 font-sans text-[11px] uppercase tracking-wide text-fg-muted">
              {report.kind.replace(/_/g, " ")}
            </p>
          </div>
          <time className="text-[12px] text-fg-muted" dateTime={report.createdAt}>
            {dateFormat.format(new Date(report.createdAt))}
          </time>
        </Link>
      ))}
    </Card>
  );
}
