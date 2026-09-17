"use client";

import {
  dismissRankRunNotice,
  isInRankRunNoticeDismissalSnapshot,
  type RankRunNoticeIdentity,
  rankRunNoticeDismissalStorageKey,
  useRankRunNoticeDismissalSnapshot,
} from "@/components/rank-runs/notice-dismissals";
import { Button } from "@/components/ui/Button";
import { ArrowClockwiseIcon as Retry } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { WarningCircleIcon as Warning } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { XIcon as Close } from "@phosphor-icons/react/dist/csr/X";
import Link from "next/link";
import { useTranslations } from "next-intl";
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

function titleFor(
  notice: BudgetNotice,
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>,
) {
  if (notice.kind === "checks-running") return t("notices.checksRunning");
  if (notice.kind === "check-failures") {
    return t("notices.failedTargets", { count: notice.failedCount });
  }
  return t("notices.budgetReached");
}

function keywordDetail(
  notice: BudgetNotice,
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>,
): ReactNode {
  if (notice.kind === "checks-running") {
    return t("notices.keywordDetail");
  }
  if (notice.kind === "check-failures") return notice.detail;
  return t("notices.resume");
}

function runsCopy(
  notice: BudgetNotice,
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>,
) {
  return notice.kind === "budget-exhausted" ? titleFor(notice, t) : keywordDetail(notice, t);
}

function isFailure(notice: BudgetNotice) {
  return notice.kind === "check-failures";
}

function NoticeAction({
  layout,
  notice,
}: Readonly<{ layout: BudgetNoticesLayout; notice: BudgetNotice }>) {
  const t = useTranslations("projectRuns.rankRuns");
  if (notice.kind === "check-failures") {
    return (
      <Button
        aria-label={t("notices.retryAria")}
        onClick={notice.onRetry}
        size="sm"
        startIcon={<Retry aria-hidden size={14} weight="regular" />}
        variant="secondary"
      >
        {t("notices.retry")}
      </Button>
    );
  }
  const href =
    notice.kind === "budget-exhausted" ? notice.budgetSettingsHref : notice.checkRunsHref;
  const label =
    notice.kind === "budget-exhausted" ? t("notices.editBudget") : t("notices.viewRuns");
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
  const t = useTranslations("projectRuns.rankRuns");
  return (
    <Button
      aria-label={t("notices.dismissAria")}
      onClick={() => dismissRankRunNotice(noticeIdentity(notice))}
      size="sm"
      style={{ height: 26, minHeight: 26, minWidth: 26, padding: 0, width: 26 }}
      title={t("notices.dismiss")}
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
  const t = useTranslations("projectRuns.rankRuns");
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
        <strong className="block font-semibold">{titleFor(notice, t)}</strong>
        <span className="block">{keywordDetail(notice, t)}</span>
      </span>
      <NoticeAction layout={layout} notice={notice} />
      <DismissButton notice={notice} />
    </output>
  );
}

function RunsNotice({ notice }: Readonly<{ notice: BudgetNotice }>) {
  const t = useTranslations("projectRuns.rankRuns");
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-border bg-bg-sunken px-[13px] py-[11px]"
      role="status"
    >
      <span className="min-w-0 flex-1 basis-80 text-pretty text-[12.5px] leading-[1.55] text-fg">
        {runsCopy(notice, t)}
      </span>
      <NoticeAction layout="runs" notice={notice} />
      <DismissButton notice={notice} />
    </div>
  );
}

export function BudgetNotices({ layout = "runs", notices }: Readonly<BudgetNoticesProps>) {
  const t = useTranslations("projectRuns.rankRuns");
  const identities = notices.map(noticeIdentity);
  const dismissalSnapshot = useRankRunNoticeDismissalSnapshot(identities);
  const visibleNotices = notices.filter(
    (notice) => !isInRankRunNoticeDismissalSnapshot(dismissalSnapshot, noticeIdentity(notice)),
  );

  if (visibleNotices.length === 0) return null;
  if (layout === "runs") {
    return (
      <section className="flex flex-col gap-2 px-4 pt-3.5" aria-label={t("runNotices")}>
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
