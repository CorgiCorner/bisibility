"use client";

import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { KeywordDetailTrafficState } from "@/lib/keyword-detail/state-model";
import type { KeywordTrafficDetail, PageTrafficSnapshotLike } from "@/lib/queries/keyword-traffic";
import { appPath } from "@/lib/routing/app-path";
import { QUERY_STATS_LAG_DAYS } from "@/lib/traffic/constants";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

type QueryTraffic = NonNullable<KeywordTrafficDetail["query"]>;
type Stat = { label: string; value: string | null };

type KeywordTrafficCardProps = {
  projectRef: string;
  traffic: KeywordTrafficDetail;
  trafficState?: KeywordDetailTrafficState;
};

const providerLabels: Record<string, string> = {
  ga4: "Google Analytics 4",
  gsc: "Search Console",
  plausible: "Plausible",
};

function providerLabel(provider: string) {
  return providerLabels[provider] ?? provider.replace(/[-_]/g, " ");
}

function formatCount(value: number, format: ReturnType<typeof useFormatter>) {
  return format.number(value, { maximumFractionDigits: 0 });
}

function formatRate(value: number, format: ReturnType<typeof useFormatter>) {
  const percent = value > 1 ? value : value * 100;
  return format.number(percent / 100, { maximumFractionDigits: 1, style: "percent" });
}

function formatDuration(
  seconds: number,
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordDetail.traffic">>,
) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.round(Math.max(0, seconds) % 60);
  return minutes
    ? t("minutesSeconds", { minutes, seconds: remainder })
    : t("seconds", { seconds: remainder });
}

function SourceChip({ provider }: Readonly<{ provider: string }>) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-border bg-bg-sunken px-2.5 font-sans tabular-nums text-[10.5px] text-fg-muted">
      {providerLabel(provider)}
    </span>
  );
}

function StatGrid({
  stats,
  t,
}: Readonly<{
  stats: Stat[];
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordDetail.traffic">>;
}>) {
  return (
    <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
      {stats.map((stat) => (
        <div
          className="rounded-control border border-border bg-bg-sunken px-3 py-2.5"
          key={stat.label}
        >
          <p className="m-0 font-sans tabular-nums text-[10px] uppercase tracking-[0.65px] text-fg-muted">
            {stat.label}
          </p>
          <p className="m-0 mt-1 text-[18px] font-semibold leading-none text-fg">
            {stat.value ?? t("noData")}
          </p>
        </div>
      ))}
    </div>
  );
}

function SearchPerformanceCard({ query }: Readonly<{ query: QueryTraffic }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.traffic");
  const format = useFormatter();
  const stats: Stat[] = [
    { label: t("clicks"), value: formatCount(query.clicks, format) },
    { label: t("impressions"), value: formatCount(query.impressions, format) },
    { label: t("ctr"), value: formatRate(query.ctr, format) },
    {
      label: t("averagePosition"),
      value: format.number(query.position, { maximumFractionDigits: 1 }),
    },
  ];

  return (
    <Card className="rounded-card" size="lg">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle>{t("searchPerformance")}</SectionTitle>
        <SourceChip provider={query.provider} />
      </div>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">
        {t("trailingDays", { days: query.windowDays })}
      </p>
      <StatGrid stats={stats} t={t} />
      <p className="m-0 mt-3 text-[11.5px] leading-[1.45] text-fg-muted">{t("gscPositionNote")}</p>
    </Card>
  );
}

function SearchPerformanceEmpty({
  connected,
  projectRef,
}: Readonly<{ connected: boolean; projectRef: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.traffic");
  return (
    <Card className="rounded-card" size="lg">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle>{t("searchPerformance")}</SectionTitle>
        <SourceChip provider="gsc" />
      </div>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">{t("trailingDays", { days: 28 })}</p>
      <div className="mt-3 rounded-control border border-dashed border-border bg-transparent px-4 py-5">
        {connected ? (
          <>
            <p className="m-0 text-[13.5px] font-medium text-fg">{t("awaitingSync")}</p>
            <p className="m-0 mt-1 text-[12px] text-fg-muted">
              {t("reportingLag", { days: QUERY_STATS_LAG_DAYS })}
            </p>
          </>
        ) : (
          <>
            <p className="m-0 text-[13.5px] text-fg-muted">{t("connectDescription")}</p>
            <Link
              className="mt-3 inline-flex text-[13px] font-semibold text-fg underline decoration-fg underline-offset-3"
              href={appPath(projectRef, "integrations")}
            >
              {t("connect")}
            </Link>
          </>
        )}
      </div>
    </Card>
  );
}

function optionalPageStats(
  page: PageTrafficSnapshotLike,
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordDetail.traffic">>,
): Stat[] {
  const stats: (Stat | null)[] = [
    page.visitors === null
      ? null
      : { label: t("visitors"), value: formatCount(page.visitors, format) },
    {
      label: page.provider === "plausible" ? t("pageviews") : t("sessions"),
      value: formatCount(page.sessions, format),
    },
    page.bounceRate === null
      ? null
      : { label: t("bounce"), value: formatRate(page.bounceRate, format) },
    page.visitDurationSeconds === null
      ? null
      : { label: t("duration"), value: formatDuration(page.visitDurationSeconds, t) },
    page.scrollDepth === null
      ? null
      : { label: t("scrollDepth"), value: formatRate(page.scrollDepth, format) },
  ];
  return stats.filter((stat): stat is Stat => stat !== null);
}

function LandingPagePerformanceCard({ pages }: Readonly<{ pages: PageTrafficSnapshotLike[] }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.traffic");
  const format = useFormatter();
  const firstPath = pages[0]?.path ?? "/";

  return (
    <Card className="rounded-card" size="lg">
      <SectionTitle>{t("landingPerformance")}</SectionTitle>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">{t("allTraffic", { path: firstPath })}</p>
      <div className="mt-3 grid gap-3">
        {pages.map((page) => (
          <section
            className="rounded-control border border-border bg-bg-elev p-3"
            key={`${page.provider}:${page.path}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <SourceChip provider={page.provider} />
              <span className="font-sans tabular-nums text-[11.5px] text-fg">{page.path}</span>
              <span className="font-sans tabular-nums text-[10.5px] text-fg-muted">
                {t("lastDays", { days: page.windowDays })}
              </span>
            </div>
            <StatGrid stats={optionalPageStats(page, format, t)} t={t} />
          </section>
        ))}
      </div>
    </Card>
  );
}

function inferredTrafficState(traffic: KeywordTrafficDetail): KeywordDetailTrafficState {
  if (traffic.query && traffic.pages.length) return "both";
  if (traffic.query) return "gsc_only";
  return traffic.hasSearchConsoleConnection ? "awaiting_sync" : "not_connected";
}

export function KeywordTrafficCard({
  projectRef,
  traffic,
  trafficState,
}: Readonly<KeywordTrafficCardProps>) {
  const state = trafficState ?? inferredTrafficState(traffic);
  const search =
    state === "awaiting_sync" || state === "not_connected" ? (
      <SearchPerformanceEmpty connected={state === "awaiting_sync"} projectRef={projectRef} />
    ) : traffic.query ? (
      <SearchPerformanceCard query={traffic.query} />
    ) : null;

  return (
    <div className="grid gap-4">
      {search}
      {state === "both" && traffic.pages.length ? (
        <LandingPagePerformanceCard pages={traffic.pages} />
      ) : null}
    </div>
  );
}
