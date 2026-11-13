"use client";

import {
  ChallengeReportPeriod,
  ChallengeReportView,
} from "@/components/challenge-report/ChallengeReportView";
import { ReportRoundProvider } from "@/components/challenge-report/report-figures";
import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import type { PublicReport } from "@/lib/report-sharing/projection";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PublicReportShare } from "./PublicReportShare";

export function PublicReportScreen({
  canShare,
  challengeEnabled = false,
  domain,
  reports,
  title,
  token,
  view,
}: Readonly<{
  canShare: boolean;
  challengeEnabled?: boolean;
  domain: string;
  reports: readonly { id: string; stage: PublicReport["stage"] }[];
  title: string;
  token: string;
  view: PublicReport;
}>) {
  const t = useTranslations("challengeReport.share");
  const stages = useTranslations("challengeReport.share.stages");
  return (
    <DateDisplayProvider>
      <main className="mx-auto grid w-full min-w-0 max-w-content gap-6 px-4 py-8">
        <header className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="m-0 text-ui-caption text-fg-muted">
              {t("brandLine", { brand: t("brand"), report: t("publicEyebrow") })}
            </p>
            {domain ? <p className="m-0 text-ui-body text-fg">{domain}</p> : null}
          </div>
          <h1 className="m-0 text-ui-section">{title}</h1>
          <ChallengeReportPeriod period={view.period} />
        </header>
        {reports.length > 1 ? (
          <nav aria-label={t("stageLabel")} className="flex flex-wrap gap-2">
            {reports.map((report, index) => (
              <Link
                className="text-ui-caption text-fg"
                href={index === 0 ? `/r/${token}` : `/r/${token}?stage=${report.id}`}
                key={report.id}
              >
                {stages(report.stage)}
              </Link>
            ))}
          </nav>
        ) : null}
        <ReportRoundProvider round={view.roundNumbers}>
          <ChallengeReportView body={view} motion showPeriod={false} />
        </ReportRoundProvider>
        {view.showBadge ? (
          <footer className="grid gap-1">
            <p className="m-0 text-ui-caption text-fg-muted">{t("badgeFooter")}</p>
            {challengeEnabled ? (
              <Link className="text-ui-caption text-fg" href="/app?challenge=1">
                {t("tryIt")}
              </Link>
            ) : null}
          </footer>
        ) : null}
        {canShare ? <PublicReportShare title={title} token={token} /> : null}
      </main>
    </DateDisplayProvider>
  );
}
