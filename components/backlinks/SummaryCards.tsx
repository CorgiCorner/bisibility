"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import type { BacklinksHistoryMonth, BacklinksSummary } from "@/lib/backlinks/types";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react";
import {
  historyFooter,
  latestHistoryDeltas,
  signedNumber,
  summaryTrends,
} from "./summary-cards-model";

type SummaryCardsProps = {
  history: BacklinksHistoryMonth[];
  summary: BacklinksSummary;
};

const cardClass = "min-w-0 rounded-[12px] border border-border bg-bg-elev px-[18px] py-4";
const labelClass = "font-mono text-[10px] font-medium uppercase tracking-[.08em] text-fg-muted";

function DeltaBadge({ value }: Readonly<{ value: number }>) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold ${
        positive ? "bg-green/10 text-green" : "bg-red/10 text-red"
      }`}
    >
      <ArrowUpRight aria-hidden className={positive ? "" : "rotate-90"} size={10} weight="bold" />
      {signedNumber(value)} / 30d
    </span>
  );
}

function TotalMetric({
  color,
  data,
  delta,
  label,
  value,
}: Readonly<{
  color: string;
  data: number[];
  delta: number;
  label: string;
  value: number;
}>) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={labelClass}>{label}</span>
        <DeltaBadge value={delta} />
      </div>
      <strong className="font-mono text-[26px] leading-none tracking-[-.01em]">
        {value.toLocaleString("en-US")}
      </strong>
      <Sparkline
        ariaLabel={`${label} 12 month trend`}
        color={color}
        data={data}
        height={44}
        responsive
      />
    </div>
  );
}

function MonthlyBars({ history }: Readonly<{ history: BacklinksHistoryMonth[] }>) {
  const maximum = Math.max(1, ...history.flatMap((month) => [month.newLinks, month.lostLinks]));
  return (
    <div
      aria-label="New and lost backlinks by month"
      className="grid min-h-[150px] grid-cols-12 items-center gap-1"
      role="img"
    >
      {history.map((month) => (
        <div className="grid h-[128px] grid-rows-2" key={month.month}>
          <span className="flex items-end justify-center border-b border-border-strong">
            <span
              className="w-[18px] rounded-t-[2px] bg-green/70"
              style={{ height: `${Math.max(3, (month.newLinks / maximum) * 58)}px` }}
            />
          </span>
          <span className="flex items-start justify-center">
            <span
              className="w-[18px] rounded-b-[2px] bg-red/65"
              style={{ height: `${Math.max(3, (month.lostLinks / maximum) * 58)}px` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function NewLostCard({ history }: Readonly<{ history: BacklinksHistoryMonth[] }>) {
  const footer = historyFooter(history);
  return (
    <section className={`${cardClass} grid content-start gap-2.5`} aria-label="New vs lost">
      <div className="flex items-center justify-between gap-3">
        <span className={labelClass}>New vs lost, monthly</span>
        <span className="flex gap-3.5 text-[11.5px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[9px] w-[9px] rounded-[3px] bg-green/75" /> New
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[9px] w-[9px] rounded-[3px] bg-red/70" /> Lost
          </span>
        </span>
      </div>
      <MonthlyBars history={history} />
      <div className="grid grid-cols-12 text-center font-mono text-[9px] text-fg-faint">
        {history.map((month) => (
          <span key={month.month}>
            {new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString("en", {
              month: "short",
              timeZone: "UTC",
            })}
          </span>
        ))}
      </div>
      <p className="m-0 border-t border-border pt-2 text-[12px] text-fg-muted">
        Net <strong className="font-mono text-green">{signedNumber(footer.net)}</strong> links in 12
        months - biggest loss: {footer.biggestLoss} in {footer.biggestLossMonth}
      </p>
    </section>
  );
}

function ProfileHealth({ summary }: Readonly<{ summary: BacklinksSummary }>) {
  const rows = [
    ["Domain rank", summary.domainRank],
    ["Target spam score", summary.spamScore.toFixed(1)],
    ["Dofollow links", `${summary.dofollowPct}%`],
    ["Referring pages", summary.referringPages.toLocaleString("en-US")],
    ["Broken backlinks", summary.brokenBacklinks],
    ["Broken pages", summary.brokenPages],
  ] as const;
  return (
    <section className={`${cardClass} flex flex-col`} aria-label="Profile health">
      <span className={`${labelClass} mb-1.5`}>Profile health</span>
      {rows.map(([label, value], index) => (
        <div
          className={`flex items-center justify-between gap-2 py-2 ${
            index === rows.length - 1 ? "" : "border-b border-border-soft"
          }`}
          key={label}
        >
          <span className="text-[13px] text-fg-muted">{label}</span>
          <strong className="inline-flex items-center gap-1.5 font-mono text-[13.5px]">
            {label === "Target spam score" ? (
              <span className="h-[7px] w-[7px] rounded-full bg-green" />
            ) : null}
            {value}
          </strong>
        </div>
      ))}
      <p className="mb-0 mt-auto pt-2 text-[12px] leading-5 text-fg-faint">
        Spam and rank come with the summary call - no extra cost.
      </p>
    </section>
  );
}

export function SummaryCards({ history, summary }: Readonly<SummaryCardsProps>) {
  const deltas = latestHistoryDeltas(history);
  const trends = summaryTrends(history, summary.backlinksTotal, summary.referringDomainsTotal);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,.95fr)]">
      <section className={`${cardClass} grid gap-3.5`} aria-label="Backlink totals">
        <TotalMetric
          color="var(--accent)"
          data={trends.backlinks}
          delta={deltas.backlinks}
          label="Backlinks"
          value={summary.backlinksTotal}
        />
        <div className="border-t border-border pt-3">
          <TotalMetric
            color="var(--fg-muted)"
            data={trends.referringDomains}
            delta={deltas.referringDomains}
            label="Referring domains"
            value={summary.referringDomainsTotal}
          />
        </div>
      </section>
      <NewLostCard history={history} />
      <ProfileHealth summary={summary} />
    </div>
  );
}
