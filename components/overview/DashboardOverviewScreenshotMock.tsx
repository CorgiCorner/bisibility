import { HighlightLists } from "@/components/overview/HighlightLists";
import { KpiCard } from "@/components/overview/KpiCard";
import { overviewFixture } from "@/components/overview/overview-fixtures";
import { PositionDistributionCard } from "@/components/overview/PositionDistributionCard";
import { PositionTrendCard } from "@/components/overview/PositionTrendCard";
import { BrandLockup } from "@/components/ui";
import { navItems } from "@/lib/nav/nav-items";
import { appPath } from "@/lib/routing/app-path";
import {
  BellIcon as Bell,
  ChartLineUpIcon as ChartLineUp,
  MagnifyingGlassIcon as MagnifyingGlass,
} from "@phosphor-icons/react/ssr";

const screenshotHighlights = overviewFixture.highlights.slice(0, 2);

function ScreenshotSidebar() {
  const items = navItems("prj_7Kd2Qf9m");
  return (
    <aside className="flex min-h-full flex-col border-border border-r bg-bg-elev px-[14px] py-4">
      <div className="flex items-center px-2 pb-4 pt-1.5">
        <BrandLockup />
      </div>

      <div className="mb-[14px] rounded-[10px] border border-border-strong bg-bg-elev px-[11px] py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-accent-soft text-accent-text">
            <ChartLineUp aria-hidden size={14} weight="bold" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight">acme.dev</span>
            <span className="block font-mono text-[10px] text-fg-muted">248 keywords</span>
          </span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = item.href === appPath("prj_7Kd2Qf9m", "overview");
          const Icon = item.icon;

          return (
            // Same current-page vocabulary as the rail this depicts: a dot in the gutter, a
            // filled glyph and a 600 label. No fill - the row surface belongs to hover, and a
            // screenshot showing a treatment the app dropped teaches the wrong screen.
            <div
              className={[
                "relative ml-2.5 flex h-9 items-center gap-2.5 rounded-[9px] pr-[11px] pl-[1px] text-[13.5px] font-medium",
                active ? "font-semibold text-fg" : "text-fg-muted",
              ].join(" ")}
              key={item.href}
            >
              {active ? (
                <span
                  aria-hidden
                  className="-left-2.5 -translate-y-1/2 absolute top-1/2 h-1.5 w-1.5 rounded-full bg-accent-solid"
                />
              ) : null}
              <span className="grid h-[30px] w-[30px] flex-none place-items-center">
                <Icon
                  aria-hidden
                  className="text-current"
                  size={18}
                  weight={active ? "fill" : "regular"}
                />
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto rounded-[12px] border border-border bg-bg-elev px-3 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">Owner</div>
        <div className="mt-1 truncate text-[13px] font-semibold text-fg">founder@acme.dev</div>
      </div>
    </aside>
  );
}

function ScreenshotHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-border border-b bg-bg px-7 py-[14px]">
      <div className="min-w-0">
        <h1 className="m-0 text-[21px] font-semibold leading-tight tracking-[-0.4px]">Overview</h1>
        <div className="mt-1 flex items-center gap-[9px] font-mono text-[11.5px] text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-green" aria-hidden />
          <span>acme.dev / 248 keywords</span>
          <span className="rounded-md border border-border bg-bg-elev px-1.5 py-0.5">
            prj_7Kd2Qf9m
          </span>
        </div>
      </div>
      <div className="flex flex-none items-center gap-2.5">
        <div className="flex h-[38px] items-center gap-2.5 rounded-[10px] border border-border-strong bg-bg-elev px-3 text-[13px] font-medium text-fg-muted">
          <MagnifyingGlass aria-hidden size={15} />
          <span>Search...</span>
          <span className="rounded-md bg-bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
            Cmd K
          </span>
        </div>
        <div className="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-border-strong bg-bg-elev text-fg-muted">
          <Bell aria-hidden size={16} weight="bold" />
        </div>
        <div className="grid h-[38px] w-[38px] place-items-center rounded-full bg-bg-sunken font-mono text-[11px] font-semibold text-fg-muted">
          FA
        </div>
      </div>
    </header>
  );
}

function ScreenshotOverview() {
  return (
    <div className="flex min-w-0 flex-col gap-4 p-6">
      <section aria-label="Overview KPIs" className="grid grid-cols-4 gap-4">
        {overviewFixture.kpis.map((kpi) => (
          <KpiCard {...kpi} key={kpi.label} />
        ))}
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <PositionTrendCard data={overviewFixture.trend} seriesLabel={overviewFixture.domain} />
        <PositionDistributionCard buckets={overviewFixture.distribution} />
      </section>

      <HighlightLists lists={screenshotHighlights} projectRef="prj_demo" />
    </div>
  );
}

export function DashboardOverviewScreenshotMock() {
  return (
    <div className="w-[1280px] overflow-hidden bg-bg text-fg" data-dashboard-screenshot>
      <div className="grid min-h-[860px] grid-cols-[232px_minmax(0,1fr)]">
        <ScreenshotSidebar />
        <div className="min-w-0 bg-bg">
          <ScreenshotHeader />
          <ScreenshotOverview />
        </div>
      </div>
    </div>
  );
}
