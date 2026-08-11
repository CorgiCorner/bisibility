import { Card, SectionTitle } from "@/components/ui";
import type { KeywordDetailTrafficState } from "@/lib/keyword-detail/state-model";
import type { KeywordTrafficDetail, PageTrafficSnapshotLike } from "@/lib/queries/keyword-traffic";
import { appPath } from "@/lib/routing/app-path";
import { QUERY_STATS_LAG_DAYS } from "@/lib/traffic/constants";
import Link from "next/link";

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

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatRate(value: number) {
  const percent = value > 1 ? value : value * 100;
  return `${percent.toFixed(1)}%`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.round(Math.max(0, seconds) % 60);
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function SourceChip({ provider }: Readonly<{ provider: string }>) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-border bg-bg-sunken px-2.5 font-mono text-[10.5px] text-fg-muted">
      {providerLabel(provider)}
    </span>
  );
}

function StatGrid({ stats }: Readonly<{ stats: Stat[] }>) {
  return (
    <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
      {stats.map((stat) => (
        <div
          className="rounded-[9px] border border-border bg-bg-sunken px-3 py-2.5"
          key={stat.label}
        >
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.65px] text-fg-muted">
            {stat.label}
          </p>
          <p className="m-0 mt-1 text-[18px] font-semibold leading-none text-fg">
            {stat.value ?? "No data"}
          </p>
        </div>
      ))}
    </div>
  );
}

function SearchPerformanceCard({ query }: Readonly<{ query: QueryTraffic }>) {
  const stats: Stat[] = [
    { label: "Clicks", value: formatCount(query.clicks) },
    { label: "Impressions", value: formatCount(query.impressions) },
    { label: "CTR", value: formatRate(query.ctr) },
    { label: "Avg. position", value: query.position.toFixed(1) },
  ];

  return (
    <Card className="rounded-[14px]" size="lg">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle>Search performance</SectionTitle>
        <SourceChip provider={query.provider} />
      </div>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">Trailing {query.windowDays} days</p>
      <StatGrid stats={stats} />
      <p className="m-0 mt-3 text-[11.5px] leading-[1.45] text-fg-muted">
        GSC position is an average across real impressions and may differ from the latest rank
        check.
      </p>
    </Card>
  );
}

function SearchPerformanceEmpty({
  connected,
  projectRef,
}: Readonly<{ connected: boolean; projectRef: string }>) {
  return (
    <Card className="rounded-[14px]" size="lg">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle>Search performance</SectionTitle>
        <SourceChip provider="gsc" />
      </div>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">Trailing 28 days</p>
      <div className="mt-3 rounded-[11px] border border-dashed border-border-strong bg-transparent px-4 py-5">
        {connected ? (
          <>
            <p className="m-0 text-[13.5px] font-medium text-fg">Awaiting first traffic sync.</p>
            <p className="m-0 mt-1 text-[12px] text-fg-muted">
              Search Console data arrives with an approximately {QUERY_STATS_LAG_DAYS}-day reporting
              lag.
            </p>
          </>
        ) : (
          <>
            <p className="m-0 text-[13.5px] text-fg-muted">
              Connect Search Console to see clicks, impressions and CTR for this keyword.
            </p>
            <Link
              className="mt-3 inline-flex text-[13px] font-semibold text-accent-text"
              href={appPath(projectRef, "integrations")}
            >
              Connect Search Console
            </Link>
          </>
        )}
      </div>
    </Card>
  );
}

function optionalPageStats(page: PageTrafficSnapshotLike): Stat[] {
  const stats: (Stat | null)[] = [
    page.visitors === null ? null : { label: "Visitors", value: formatCount(page.visitors) },
    {
      label: page.provider === "plausible" ? "Pageviews" : "Sessions",
      value: formatCount(page.sessions),
    },
    page.bounceRate === null ? null : { label: "Bounce", value: formatRate(page.bounceRate) },
    page.visitDurationSeconds === null
      ? null
      : { label: "Duration", value: formatDuration(page.visitDurationSeconds) },
    page.scrollDepth === null
      ? null
      : { label: "Scroll depth", value: formatRate(page.scrollDepth) },
  ];
  return stats.filter((stat): stat is Stat => stat !== null);
}

function LandingPagePerformanceCard({ pages }: Readonly<{ pages: PageTrafficSnapshotLike[] }>) {
  const firstPath = pages[0]?.path ?? "the ranking page";

  return (
    <Card className="rounded-[14px]" size="lg">
      <SectionTitle>Landing page performance</SectionTitle>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">
        All traffic to {firstPath}, not attributed to this keyword.
      </p>
      <div className="mt-3 grid gap-3">
        {pages.map((page) => (
          <section
            className="rounded-[11px] border border-border bg-bg-elev p-3"
            key={`${page.provider}:${page.path}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <SourceChip provider={page.provider} />
              <span className="font-mono text-[11.5px] text-fg">{page.path}</span>
              <span className="font-mono text-[10.5px] text-fg-muted">
                last {page.windowDays} days
              </span>
            </div>
            <StatGrid stats={optionalPageStats(page)} />
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
