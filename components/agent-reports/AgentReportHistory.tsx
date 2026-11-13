import { Card } from "@/components/ui/Card";
import type { AgentReportSummary } from "@/lib/agent-reports/model";
import type { ReportShareSummary } from "@/lib/report-sharing/model";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import type { ReactNode } from "react";

type HistoryReport = AgentReportSummary & {
  audience?: "link" | "members";
  draft?: boolean;
  share?: ReportShareSummary | null;
};

export function AgentReportHistory({
  audience,
  draftLabel,
  kindLabels,
  reports,
  projectRef,
  locale,
  share,
  timeZone,
}: Readonly<{
  audience?: (report: HistoryReport) => string;
  draftLabel?: string;
  kindLabels?: Readonly<Record<string, string>>;
  reports: readonly HistoryReport[];
  projectRef: ProjectRef;
  locale: string;
  share?: (report: HistoryReport) => ReactNode;
  timeZone: string;
}>) {
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone });
  return (
    <Card className="divide-y divide-border overflow-hidden p-0">
      {reports.map((report) => (
        <div
          className="relative flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-bg-sunken focus-within:bg-bg-sunken"
          data-report-row=""
          key={report.id}
        >
          <Link
            className="min-w-0 flex-1 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent-solid"
            href={appPath(projectRef, "agent-reports", report.id)}
          >
            <h2 className="m-0 break-words text-ui-body font-semibold leading-snug">
              {report.title}
            </h2>
            <p className="mb-0 mt-1 text-ui-caption text-fg-muted">
              {kindLabels?.[report.kind] ?? report.kind.replace(/_/g, " ")}
              {report.draft && draftLabel ? ` · ${draftLabel}` : ""}
            </p>
          </Link>
          {audience ? (
            <p className="m-0 text-ui-caption text-fg-muted">{audience(report)}</p>
          ) : null}
          {share ? (
            <div className="relative z-10" data-report-row-action="">
              {share(report)}
            </div>
          ) : null}
          <time
            className="shrink-0 text-ui-caption tabular-nums text-fg-muted"
            dateTime={report.createdAt}
          >
            {dateFormat.format(new Date(report.createdAt))}
          </time>
        </div>
      ))}
    </Card>
  );
}
