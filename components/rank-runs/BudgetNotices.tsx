"use client";

import {
  dismissRankRunNotice,
  isInRankRunNoticeDismissalSnapshot,
  type RankRunNoticeIdentity,
  rankRunNoticeDismissalStorageKey,
  useRankRunNoticeDismissalSnapshot,
} from "@/components/rank-runs/notice-dismissals";
import { Button } from "@/components/ui";
import {
  CaretRightIcon as CaretRight,
  XIcon as Close,
  ArrowClockwiseIcon as Retry,
  WarningCircleIcon as Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

export type BudgetNotice =
  | {
      checkRunsHref: string;
      kind: "checks-running";
      runId: string;
    }
  | {
      detail: string;
      failedCount: number;
      kind: "check-failures";
      onRetry: () => void;
      runId: string;
    }
  | {
      budgetSettingsHref: string;
      capPeriod: string;
      kind: "budget-exhausted";
    };

export type BudgetNoticesLayout = "keyword-flush" | "keyword-stack" | "runs";

export type BudgetNoticesProps = {
  layout?: BudgetNoticesLayout;
  notices: readonly BudgetNotice[];
};

function noticeIdentity(notice: BudgetNotice): RankRunNoticeIdentity {
  if (notice.kind === "checks-running" || notice.kind === "check-failures") {
    return { kind: notice.kind, runId: notice.runId };
  }
  return { capPeriod: notice.capPeriod, kind: notice.kind };
}

function noticeKey(notice: BudgetNotice) {
  return rankRunNoticeDismissalStorageKey(noticeIdentity(notice));
}

function titleFor(notice: BudgetNotice) {
  if (notice.kind === "checks-running") return "Rank targets are running.";
  if (notice.kind === "check-failures") {
    return `${notice.failedCount} ${notice.failedCount === 1 ? "target" : "targets"} failed in the last 24 hours.`;
  }
  return "Targets are paused because the budget was reached.";
}

function keywordDetail(notice: BudgetNotice): ReactNode {
  if (notice.kind === "checks-running") {
    return "Ranking data will appear after the running targets finish.";
  }
  if (notice.kind === "check-failures") return notice.detail;
  return "Edit the budget to resume targets.";
}

function runsCopy(notice: BudgetNotice) {
  return notice.kind === "budget-exhausted" ? titleFor(notice) : keywordDetail(notice);
}

function isFailure(notice: BudgetNotice) {
  return notice.kind === "check-failures";
}

function NoticeAction({
  layout,
  notice,
}: Readonly<{ layout: BudgetNoticesLayout; notice: BudgetNotice }>) {
  if (notice.kind === "check-failures") {
    return (
      <Button
        aria-label="Retry failed targets"
        onClick={notice.onRetry}
        size="sm"
        startIcon={<Retry aria-hidden size={14} weight="regular" />}
        variant="secondary"
      >
        Retry
      </Button>
    );
  }
  const href =
    notice.kind === "budget-exhausted" ? notice.budgetSettingsHref : notice.checkRunsHref;
  const label = notice.kind === "budget-exhausted" ? "Edit budget" : "View runs";
  if (layout === "runs") {
    return (
      <Link
        className="shrink-0 text-xs font-semibold text-fg no-underline hover:underline"
        href={href}
      >
        {label}
      </Link>
    );
  }
  return (
    <Button
      component={Link}
      endIcon={<CaretRight aria-hidden size={14} weight="regular" />}
      href={href}
      size="sm"
      variant="secondary"
    >
      {label}
    </Button>
  );
}

function DismissButton({ notice }: Readonly<{ notice: BudgetNotice }>) {
  return (
    <Button
      aria-label="Dismiss this notice"
      onClick={() => dismissRankRunNotice(noticeIdentity(notice))}
      size="sm"
      sx={{ height: 26, minHeight: 26, minWidth: 26, padding: 0, width: 26 }}
      title="Dismiss"
      variant="ghost"
    >
      <Close aria-hidden size={14} weight="regular" />
    </Button>
  );
}

function KeywordNotice({
  layout,
  notice,
}: Readonly<{ layout: BudgetNoticesLayout; notice: BudgetNotice }>) {
  const critical = isFailure(notice);
  return (
    <output
      className={`flex flex-wrap items-center gap-3 px-4 py-[11px] ${critical ? "bg-red/[.07]" : "bg-yellow/10"}`}
    >
      <Warning
        aria-hidden
        className={`shrink-0 ${critical ? "text-red-text" : "text-yellow-text"}`}
        size={17}
        weight="regular"
      />
      <span className="min-w-[220px] flex-1 text-[12.5px] text-fg">
        <strong className="block font-semibold">{titleFor(notice)}</strong>
        <span className="block">{keywordDetail(notice)}</span>
      </span>
      <NoticeAction layout={layout} notice={notice} />
      <DismissButton notice={notice} />
    </output>
  );
}

function RunsNotice({ notice }: Readonly<{ notice: BudgetNotice }>) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-border bg-bg-sunken px-[13px] py-[11px]"
      role="status"
    >
      <span className="min-w-0 flex-1 basis-80 text-pretty text-[12.5px] leading-[1.55] text-fg">
        {runsCopy(notice)}
      </span>
      <NoticeAction layout="runs" notice={notice} />
      <DismissButton notice={notice} />
    </div>
  );
}

export function BudgetNotices({ layout = "runs", notices }: Readonly<BudgetNoticesProps>) {
  const identities = notices.map(noticeIdentity);
  const dismissalSnapshot = useRankRunNoticeDismissalSnapshot(identities);
  const visibleNotices = notices.filter(
    (notice) => !isInRankRunNoticeDismissalSnapshot(dismissalSnapshot, noticeIdentity(notice)),
  );

  if (visibleNotices.length === 0) return null;
  if (layout === "runs") {
    return (
      <section className="flex flex-col gap-2 px-4 pt-3.5" aria-label="Run notices">
        {visibleNotices.map((notice) => (
          <RunsNotice key={noticeKey(notice)} notice={notice} />
        ))}
      </section>
    );
  }
  const noticesList = visibleNotices.map((notice) => (
    <KeywordNotice key={noticeKey(notice)} layout={layout} notice={notice} />
  ));
  if (layout === "keyword-stack") {
    return (
      <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
        {noticesList}
      </div>
    );
  }
  return <>{noticesList}</>;
}
