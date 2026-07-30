import { Card, MonoText, SectionTitle } from "@/components/ui";
import type { KeywordTrafficDetail, PageTrafficSnapshotLike } from "@/lib/queries/keyword-traffic";
import { appPath } from "@/lib/routing/app-path";
import { QUERY_STATS_LAG_DAYS } from "@/lib/traffic/constants";
import Link from "next/link";

type QueryTraffic = NonNullable<KeywordTrafficDetail["query"]>;
type Stat = { label: string; value: string | null };

type KeywordTrafficCardProps = {
  projectRef: string;
  traffic: KeywordTrafficDetail;
};

const providerLabels: Record<string, string> = {
  ga4: "GA4",
  gsc: "Search Console",
  plausible: "Plausible",
};

function providerLabel(provider: string) {
  return (
    providerLabels[provider] ??
    provider
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatRate(value: number) {
  const percent = value > 1 ? value : value * 100;
  return `${percent.toFixed(1)}%`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? formatCount(value) : value.toFixed(1);
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function StatCell({ label, value }: Readonly<Stat>) {
  return (
    <div className="min-w-0 rounded-[9px] border border-border bg-bg-sunken px-3 py-2.5">
      <MonoText className="uppercase tracking-[0.7px]" muted size="sm">
        {label}
      </MonoText>
      <div className="mt-1 truncate text-[18px] font-semibold text-fg">
        {value ?? <span className="text-fg-faint">-</span>}
      </div>
    </div>
  );
}

function QuerySection({ query }: Readonly<{ query: QueryTraffic }>) {
  const stats: Stat[] = [
    { label: "Clicks", value: formatCount(query.clicks) },
    { label: "Impressions", value: formatCount(query.impressions) },
    { label: "CTR", value: formatRate(query.ctr) },
    { label: "Avg. position", value: query.position.toFixed(1) },
  ];

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <SectionTitle>Search stats</SectionTitle>
          <MonoText muted>
            Trailing {query.windowDays} days / {providerLabel(query.provider)}
          </MonoText>
        </div>
        <MonoText muted>{formatDate(query.date)}</MonoText>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
        {stats.map((stat) => (
          <StatCell key={stat.label} {...stat} />
        ))}
      </div>
    </section>
  );
}

function optionalPageStats(page: PageTrafficSnapshotLike): Stat[] {
  const stats: (Stat | null)[] = [
    page.visitors === null ? null : { label: "Visitors", value: formatCount(page.visitors) },
    page.bounceRate === null ? null : { label: "Bounce", value: formatRate(page.bounceRate) },
    page.visitDurationSeconds === null
      ? null
      : { label: "Duration", value: formatDuration(page.visitDurationSeconds) },
    page.scrollDepth === null ? null : { label: "Scroll", value: formatRate(page.scrollDepth) },
  ];
  return stats.filter((stat): stat is Stat => stat !== null);
}

function PageBlock({ page }: Readonly<{ page: PageTrafficSnapshotLike }>) {
  const stats: Stat[] = [
    { label: "Sessions", value: formatCount(page.sessions) },
    {
      label: "Engagement",
      value: page.engagementRate === null ? null : formatRate(page.engagementRate),
    },
    { label: "Key events", value: page.keyEvents === null ? null : formatNumber(page.keyEvents) },
    ...optionalPageStats(page),
  ];

  return (
    <div className="rounded-[11px] border border-border bg-bg-elev p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-fg">
            {providerLabel(page.provider)}
          </div>
          <MonoText className="truncate" muted>
            {page.path}
          </MonoText>
        </div>
        <MonoText muted>
          {page.windowDays}d / {formatDate(page.date)}
        </MonoText>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-2">
        {stats.map((stat) => (
          <StatCell key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  );
}

function TrafficEmptyState({
  connected,
  projectRef,
}: Readonly<{ connected: boolean; projectRef: string }>) {
  return (
    <Card className="rounded-[14px]" size="lg">
      <SectionTitle>Search &amp; page stats</SectionTitle>
      {connected ? (
        <div className="mt-3 rounded-[11px] border border-dashed border-border-strong bg-bg-sunken px-4 py-5">
          <p className="m-0 text-[13.5px] font-medium text-fg">Awaiting first traffic sync.</p>
          <MonoText className="mt-1 block" muted>
            Search Console data arrives with an approximately {QUERY_STATS_LAG_DAYS}-day reporting
            lag.
          </MonoText>
        </div>
      ) : (
        <div className="mt-3 rounded-[11px] border border-dashed border-border-strong bg-bg-sunken px-4 py-5">
          <p className="m-0 text-[13.5px] text-fg-muted">
            Connect Search Console to see clicks, impressions and CTR for this keyword.
          </p>
          <Link
            className="mt-3 inline-flex text-[13px] font-semibold text-accent hover:text-accent-hover"
            href={appPath(projectRef, "integrations")}
          >
            Connect Search Console
          </Link>
        </div>
      )}
    </Card>
  );
}

export function KeywordTrafficCard({ projectRef, traffic }: Readonly<KeywordTrafficCardProps>) {
  if (!traffic.query && traffic.pages.length === 0) {
    return <TrafficEmptyState connected={traffic.hasAnalyticsConnection} projectRef={projectRef} />;
  }

  return (
    <Card className="rounded-[14px]" size="lg">
      <div className="grid gap-5">
        {traffic.query ? <QuerySection query={traffic.query} /> : null}
        {traffic.pages.length > 0 ? (
          <section>
            <div>
              <SectionTitle>Page stats</SectionTitle>
              <MonoText muted>Traffic for the matched target or ranking page</MonoText>
            </div>
            <div className="mt-3 grid gap-3">
              {traffic.pages.map((page) => (
                <PageBlock key={`${page.provider}:${page.path}`} page={page} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Card>
  );
}
