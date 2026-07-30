import { Card } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import Button from "@mui/material/Button";
import {
  ArrowRightIcon as ArrowRight,
  InfoIcon as Info,
  PlusCircleIcon as PlusCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { dataSourceStatusColor } from "./data-source-status";
import type { DataSourceHealth, HighlightRow } from "./types";

// Values that signal an absent reading and should render in the muted tone.
const mutedValue = /^(not connected|never|not scheduled)$/i;

export function DataSourceNoDataPanel({ health }: Readonly<{ health: DataSourceHealth }>) {
  const color = dataSourceStatusColor(health.status);

  return (
    <Card size="md" style={{ borderRadius: 14, padding: "18px 20px" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[14.5px] font-semibold leading-normal text-fg">Data source</div>
          <div className="mt-0.5 font-mono text-[11px] leading-normal text-fg-faint">
            {health.description}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-[7px] rounded-full px-[11px] py-[5px] font-mono text-[11.5px] font-semibold leading-normal"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
            color,
          }}
        >
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          {health.status}
        </span>
      </div>
      <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-[18px] gap-y-3.5">
        {health.metrics.map((metric) => (
          <div className="min-w-0" key={metric.label}>
            <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-fg-faint">
              {metric.label}
            </div>
            <div
              className={`mt-[5px] truncate text-sm font-semibold leading-normal ${
                mutedValue.test(metric.value) ? "text-fg-faint" : "text-fg"
              }`}
            >
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-[9px] border-t border-border-soft pt-3.5 text-[12.5px] leading-normal text-fg-muted">
        <Info aria-hidden className="flex-none text-accent" size={15} />
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
      <div className="px-[18px] pb-3 pt-[15px]">
        <div className="flex items-center gap-2 text-sm font-semibold leading-normal text-fg">
          <PlusCircle aria-hidden className="text-blue" size={16} weight="fill" />
          Recently added
        </div>
        <div className="mt-[3px] font-mono text-[10.5px] leading-normal text-fg-faint">
          Waiting for first check
        </div>
      </div>
      {rows.map((row) => (
        <Link
          className="flex items-center justify-between gap-2.5 border-t border-border-soft px-[18px] py-[11px] hover:bg-bg-sunken"
          href={appPath(projectRef, "keywords")}
          key={row.id}
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium leading-normal text-fg">
              {row.keyword}
            </span>
            <span className="mt-px block truncate font-mono text-[10.5px] leading-normal text-fg-faint">
              {row.note}
            </span>
          </span>
          <span className="flex-none font-mono text-[11.5px] leading-normal text-fg-faint">
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
      color="inherit"
      component={Link}
      endIcon={<ArrowRight size={15} weight="bold" />}
      href={appPath(projectRef, "keywords")}
      sx={{
        alignSelf: "flex-start",
        borderColor: "var(--border-strong)",
        borderRadius: "9px",
        color: "var(--fg)",
        fontSize: "13px",
        fontWeight: 600,
        minHeight: 0,
        p: "9px 15px",
        "&:hover": { borderColor: "var(--accent)", color: "var(--accent)" },
        "& .MuiButton-endIcon": { ml: "7px", mr: 0 },
      }}
      variant="outlined"
    >
      View all keywords
    </Button>
  );
}
