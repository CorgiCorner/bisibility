import { Button, Card } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import {
  CaretRightIcon as CaretRight,
  InfoIcon as Info,
  PlusCircleIcon as PlusCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { DataSourceStatusBadge } from "./DataSourceStatusBadge";
import type { DataSourceHealth, HighlightRow } from "./types";

// Values that signal an absent reading and should render in the muted tone.
const mutedValue = /^(not connected|never|not scheduled)$/i;

export function DataSourceNoDataPanel({ health }: Readonly<{ health: DataSourceHealth }>) {
  return (
    <Card size="md" style={{ borderRadius: 14, padding: "18px 20px" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[14.5px] font-semibold leading-normal text-fg">Data source</div>
          <div className="mt-0.5 font-mono text-[11px] leading-normal text-fg-muted">
            {health.description}
          </div>
        </div>
        <DataSourceStatusBadge status={health.status} />
      </div>
      <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4.5 gap-y-3.5">
        {health.metrics.map((metric) => (
          <div className="min-w-0" key={metric.label}>
            <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
              {metric.label}
            </div>
            <div
              className={`mt-[5px] truncate text-sm font-semibold leading-normal ${
                mutedValue.test(metric.value) ? "text-fg-muted" : "text-fg"
              }`}
            >
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-[9px] border-t border-border-soft pt-3.5 text-[12.5px] leading-normal text-fg-muted">
        <Info aria-hidden className="flex-none text-accent-text" size={15} />
        <span>{health.note}</span>
      </div>
    </Card>
  );
}

export function RecentlyAddedCard({
  projectRef,
  rows,
}: Readonly<{ projectRef: string; rows: HighlightRow[] }>) {
  return (
    <Card className="overflow-hidden" size="md" style={{ borderRadius: 14, padding: 0 }}>
      <div className="px-4.5 pb-3 pt-[15px]">
        <div className="flex items-center gap-2 text-sm font-semibold leading-normal text-fg">
          <PlusCircle aria-hidden className="text-blue-text" size={16} weight="fill" />
          Recently added
        </div>
        <div className="mt-[3px] font-mono text-[10.5px] leading-normal text-fg-muted">
          Waiting for first check
        </div>
      </div>
      {rows.map((row) => (
        <Link
          className="flex items-center justify-between gap-2.5 border-t border-border-soft px-4.5 py-[11px] hover:bg-bg-sunken"
          href={appPath(projectRef, "rank-tracker")}
          key={row.id}
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium leading-normal text-fg">
              {row.keyword}
            </span>
            <span className="mt-px block truncate font-mono text-[10.5px] leading-normal text-fg-muted">
              {row.note}
            </span>
          </span>
          <span className="flex-none font-mono text-[11.5px] leading-normal text-fg-muted">
            {row.positionText}
          </span>
        </Link>
      ))}
    </Card>
  );
}

export function ViewAllKeywordsButton({ projectRef }: Readonly<{ projectRef: string }>) {
  return (
    <Button
      component={Link}
      endIcon={<CaretRight size={15} weight="bold" />}
      href={appPath(projectRef, "rank-tracker")}
      sx={{
        alignSelf: "flex-start",
        "&:hover": { borderColor: "var(--accent)", color: "var(--accent-text)" },
        "& .MuiButton-endIcon": { ml: "7px", mr: 0 },
      }}
      variant="secondary"
    >
      View all keywords
    </Button>
  );
}
