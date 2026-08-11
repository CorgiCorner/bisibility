import { Card } from "@/components/ui";
import type { ReactNode } from "react";

const ranges = ["7d", "30d", "90d"] as const;

type EmptyModuleCardProps = {
  children: ReactNode;
  className?: string;
};

export function EmptyModuleCard({ children, className }: Readonly<EmptyModuleCardProps>) {
  return <Card className={`rounded-[14px] ${className ?? ""}`}>{children}</Card>;
}

export function EmptyModuleLabel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="m-0 font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">{children}</p>
  );
}

export function EmptyModuleTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <h2 className="m-0 text-[15px] font-semibold leading-[1.35] text-fg">{children}</h2>;
}

type StaticRangeTabsProps = {
  selected: (typeof ranges)[number];
};

export function StaticRangeTabs({ selected }: Readonly<StaticRangeTabsProps>) {
  return (
    <div
      aria-label="Position history range"
      className="inline-flex items-center gap-0.5 rounded-[8px] border border-border-strong bg-bg-elev p-0.5"
      role="tablist"
    >
      {ranges.map((range) => (
        <button
          aria-selected={range === selected}
          className={`rounded-[6px] px-2.5 py-1 font-mono text-[11px] ${
            range === selected ? "bg-nav-active text-fg" : "text-fg-muted"
          }`}
          key={range}
          role="tab"
          type="button"
        >
          {range}
        </button>
      ))}
    </div>
  );
}

type EmptyChartShellProps = {
  children: ReactNode;
  height: 180 | 280;
  selectedRange: (typeof ranges)[number];
};

export function EmptyChartShell({
  children,
  height,
  selectedRange,
}: Readonly<EmptyChartShellProps>) {
  return (
    <EmptyModuleCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EmptyModuleTitle>Position history</EmptyModuleTitle>
        <StaticRangeTabs selected={selectedRange} />
      </div>
      <div
        aria-label="Position history empty chart"
        className={`relative mt-4 overflow-hidden rounded-[12px] border border-border bg-bg-elev ${
          height === 180 ? "h-[180px]" : "h-[280px]"
        }`}
        data-chart-height={height}
      >
        <div aria-hidden className="absolute inset-x-5 top-[30%] border-t border-border-strong" />
        <div aria-hidden className="absolute inset-x-5 top-1/2 border-t border-border-strong" />
        <div
          aria-hidden
          className="absolute inset-x-5 bottom-[18%] border-t border-border-strong"
        />
        <div className="absolute inset-0 grid place-items-center px-5">{children}</div>
      </div>
    </EmptyModuleCard>
  );
}

type ChartEmptyMessageProps = {
  description?: string;
  footer: ReactNode;
  title: string;
};

export function ChartEmptyMessage({
  description,
  footer,
  title,
}: Readonly<ChartEmptyMessageProps>) {
  return (
    <div className="max-w-full rounded-[12px] border border-border-strong bg-bg-elev px-5 py-4 text-center">
      <p className="m-0 text-[13px] font-semibold text-fg">{title}</p>
      {description ? (
        <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">{description}</p>
      ) : null}
      <div className="mt-3 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full bg-bg-sunken px-3 py-1 font-mono text-[10.5px] text-fg-muted">
        {footer}
      </div>
    </div>
  );
}

export function ChartFooterItem({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="whitespace-nowrap">{children}</span>;
}
