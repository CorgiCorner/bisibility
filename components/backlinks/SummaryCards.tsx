"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { useDateFormat } from "@/components/dates/DateFormatProvider";
import type { BacklinksHistoryMonth, BacklinksSummary } from "@/lib/backlinks/types";
import { formatDateRange } from "@/lib/dates/format";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { useFormatter, useTranslations } from "next-intl";
import { historyFooter, latestHistoryDeltas, summaryTrends } from "./summary-cards-model";

type SummaryCardsProps = {
  history: BacklinksHistoryMonth[];
  historyUnavailable?: boolean;
  summary: BacklinksSummary;
};

const cardClass = "min-w-0 rounded-card border border-border bg-bg-elev px-4.5 py-4";
const labelClass =
  "font-sans tabular-nums text-[10px] font-medium uppercase tracking-[.08em] text-fg-muted";

function DeltaBadge({ value }: Readonly<{ value: number }>) {
  const t = useTranslations("projectBacklinks.workspace.summary");
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans tabular-nums text-[10.5px] font-semibold ${
        positive ? "bg-green/10 text-green-text" : "bg-red/10 text-red-text"
      }`}
    >
      <ArrowUpRight
        aria-hidden
        className={positive ? "" : "rotate-90"}
        size={10}
        weight="regular"
      />
      {t("delta", { sign: value >= 0 ? "+" : "", value })}
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
  const t = useTranslations("projectBacklinks.workspace.summary");
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={labelClass}>{label}</span>
        <DeltaBadge value={delta} />
      </div>
      <strong className="font-sans tabular-nums text-[26px] leading-none tracking-[-.01em]">
        {t("value", { value })}
      </strong>
      <Sparkline
        ariaLabel={t("trendAria", { label })}
        color={color}
        data={data}
        height={44}
        responsive
      />
    </div>
  );
}

function MonthlyBars({ history }: Readonly<{ history: BacklinksHistoryMonth[] }>) {
  const t = useTranslations("projectBacklinks.workspace.summary");
  const maximum = Math.max(1, ...history.flatMap((month) => [month.newLinks, month.lostLinks]));
  return (
    <div
      aria-label={t("monthlyAria")}
      className="grid min-h-[150px] grid-cols-12 items-center gap-1"
      role="img"
    >
      {history.map((month) => (
        <div className="grid h-[128px] grid-rows-2" key={month.month}>
          <span className="flex items-end justify-center border-b border-border">
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
  const t = useTranslations("projectBacklinks.workspace.summary");
  const dateFormat = useDateFormat();
  const footer = historyFooter(history);
  const biggestLossMonth = footer.biggestLossMonth
    ? formatDateRange(`${footer.biggestLossMonth}-01`, `${footer.biggestLossMonth}-01`, dateFormat)
    : t("notAvailable");
  return (
    <section className={`${cardClass} grid content-start gap-2.5`} aria-label={t("newLostAria")}>
      <div className="flex items-center justify-between gap-3">
        <span className={labelClass}>{t("newLost")}</span>
        <span className="flex gap-3.5 text-[11.5px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[9px] w-[9px] rounded-control bg-green/75" /> {t("new")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[9px] w-[9px] rounded-control bg-red/70" /> {t("lost")}
          </span>
        </span>
      </div>
      <MonthlyBars history={history} />
      <div className="grid grid-cols-12 text-center font-sans tabular-nums text-[9px] text-fg-muted">
        {history.map((month) => (
          <span key={month.month}>
            {formatDateRange(`${month.month}-01`, `${month.month}-01`, dateFormat)}
          </span>
        ))}
      </div>
      <p className="m-0 border-t border-border pt-2 text-[12px] text-fg-muted">
        {t("net")}{" "}
        <strong className="font-sans tabular-nums text-green-text">
          {t("signedValue", { sign: footer.net >= 0 ? "+" : "", value: footer.net })}
        </strong>{" "}
        {t("lossSummary", { loss: footer.biggestLoss, month: biggestLossMonth })}
      </p>
    </section>
  );
}

function ProfileHealth({ summary }: Readonly<{ summary: BacklinksSummary }>) {
  const t = useTranslations("projectBacklinks.workspace.summary");
  const format = useFormatter();
  const rows = [
    [t("domainRank"), t("value", { value: summary.domainRank })],
    [
      t("targetSpam"),
      format.number(summary.spamScore, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
    ],
    [t("dofollowLinks"), format.number(summary.dofollowPct / 100, { style: "percent" })],
    [t("referringPages"), t("value", { value: summary.referringPages })],
    [t("brokenBacklinks"), t("value", { value: summary.brokenBacklinks })],
    [t("brokenPages"), t("value", { value: summary.brokenPages })],
  ] as const;
  return (
    <section className={`${cardClass} flex flex-col`} aria-label={t("healthAria")}>
      <span className={`${labelClass} mb-1.5`}>{t("health")}</span>
      {rows.map(([label, value], index) => (
        <div
          className={`flex items-center justify-between gap-2 py-2 ${
            index === rows.length - 1 ? "" : "border-b border-border"
          }`}
          key={label}
        >
          <span className="text-[13px] text-fg-muted">{label}</span>
          <strong className="inline-flex items-center gap-1.5 font-sans tabular-nums text-[13.5px]">
            {label === t("targetSpam") ? (
              <span className="h-[7px] w-[7px] rounded-full bg-green" />
            ) : null}
            {value}
          </strong>
        </div>
      ))}
      <p className="mb-0 mt-auto pt-2 text-[12px] leading-5 text-fg-muted">{t("healthNote")}</p>
    </section>
  );
}

export function SummaryCards({
  history,
  historyUnavailable,
  summary,
}: Readonly<SummaryCardsProps>) {
  const t = useTranslations("projectBacklinks.workspace.summary");
  const deltas = latestHistoryDeltas(history);
  const trends = summaryTrends(history, summary.backlinksTotal, summary.referringDomainsTotal);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,.95fr)]">
      <section className={`${cardClass} grid gap-3.5`} aria-label={t("totalsAria")}>
        <TotalMetric
          color="var(--accent)"
          data={trends.backlinks}
          delta={deltas.backlinks}
          label={t("backlinks")}
          value={summary.backlinksTotal}
        />
        <div className="border-t border-border pt-3">
          <TotalMetric
            color="var(--fg-muted)"
            data={trends.referringDomains}
            delta={deltas.referringDomains}
            label={t("referringDomains")}
            value={summary.referringDomainsTotal}
          />
        </div>
      </section>
      {historyUnavailable ? null : <NewLostCard history={history} />}
      <ProfileHealth summary={summary} />
    </div>
  );
}
