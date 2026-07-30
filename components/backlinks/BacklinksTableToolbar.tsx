import { SegmentedControl, type SegmentedControlOption } from "@/components/ui";
import { FunnelSimpleIcon as FunnelSimple } from "@phosphor-icons/react";
import type { KeyboardEvent, ReactNode } from "react";
import type { BacklinksFilter, BacklinksSlice, BacklinksView } from "./backlinks-table-model";

const views: { id: BacklinksView; label: string; title?: string }[] = [
  { id: "backlinks", label: "Backlinks" },
  {
    id: "referring_domains",
    label: "Referring domains",
    title: "One row per linking domain with aggregate metrics",
  },
  { id: "top_pages", label: "Top pages", title: "Your pages ranked by fetched links" },
  { id: "anchors", label: "Anchors", title: "Anchor-text distribution across the profile" },
];

const filters: { id: BacklinksFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New 30d" },
  { id: "lost", label: "Lost 30d" },
  { id: "broken", label: "Broken" },
];

const slices = [
  { label: "One per domain", value: "one_per_domain" },
  { label: "All links", value: "all_links" },
] satisfies SegmentedControlOption<BacklinksSlice>[];

type BacklinksTableToolbarProps = {
  counts: Record<BacklinksFilter, number>;
  exportControl?: ReactNode;
  filter: BacklinksFilter;
  filterCount: number;
  onFilterChange: (filter: BacklinksFilter) => void;
  onOpenFilters: () => void;
  onSliceChange: (slice: BacklinksSlice) => void;
  onViewChange: (view: BacklinksView) => void;
  shownLabel: string;
  slice: BacklinksSlice;
  view: BacklinksView;
};

const focusClass =
  "focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function BacklinksTableToolbar({
  counts,
  exportControl,
  filter,
  filterCount,
  onFilterChange,
  onOpenFilters,
  onSliceChange,
  onViewChange,
  shownLabel,
  slice,
  view,
}: Readonly<BacklinksTableToolbarProps>) {
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keyOffsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    let nextIndex = index + (keyOffsets[event.key] ?? 0);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = views.length - 1;
    if (!(event.key in keyOffsets) && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = views[(nextIndex + views.length) % views.length];
    onViewChange(next.id);
    document.getElementById(`backlinks-tab-${next.id}`)?.focus();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 border-b border-border-strong px-4">
        <div
          aria-label="Backlinks views"
          className="flex w-full min-w-0 flex-wrap sm:w-auto"
          role="tablist"
        >
          {views.map((item) => (
            <button
              aria-controls="backlinks-view-panel"
              aria-selected={view === item.id}
              className={`-mb-px cursor-pointer whitespace-nowrap border-0 border-b-2 bg-transparent px-3.5 py-2.5 text-[13.5px] hover:text-fg ${focusClass} ${
                view === item.id
                  ? "border-accent font-semibold text-fg"
                  : "border-transparent text-fg-muted"
              }`}
              id={`backlinks-tab-${item.id}`}
              key={item.id}
              onClick={() => onViewChange(item.id)}
              onKeyDown={(event) => moveTab(event, views.indexOf(item))}
              role="tab"
              tabIndex={view === item.id ? 0 : -1}
              title={item.title}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <SegmentedControl
          ariaLabel="Backlink row grouping"
          className="my-1"
          fitContent
          onChange={onSliceChange}
          options={slices}
          size="xs"
          value={slice}
        />
        {exportControl}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-2.5">
        <button
          aria-label={`Filters ${filterCount}`}
          className={`inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[7px] border border-border-strong bg-transparent px-3 text-[13px] font-medium text-fg hover:border-fg-faint ${focusClass}`}
          onClick={onOpenFilters}
          type="button"
        >
          <FunnelSimple aria-hidden size={13} weight="bold" />
          Filters
          <span className="grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent-soft px-1 font-mono text-[10px] font-semibold text-accent-hover">
            {filterCount}
          </span>
        </button>
        {filters.map((item) => (
          <button
            aria-label={`${item.label} ${counts[item.id]}${
              item.id === "broken" ? "" : ` ${counts[item.id] === 1 ? "domain" : "domains"}`
            }`}
            aria-pressed={filter === item.id}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] hover:border-fg-faint ${focusClass} ${
              filter === item.id
                ? "border-border-strong bg-bg-sunken font-semibold text-fg"
                : "border-border bg-transparent text-fg-muted"
            }`}
            key={item.id}
            onClick={() => onFilterChange(item.id)}
            type="button"
          >
            {item.label}
            <span className="font-mono text-[11px] text-fg-faint">{counts[item.id]}</span>
            {item.id !== "broken" ? (
              <span className="text-[10px] text-fg-faint">
                {counts[item.id] === 1 ? "domain" : "domains"}
              </span>
            ) : null}
          </button>
        ))}
        <span className="flex-1" />
        {shownLabel ? <span className="text-[12.5px] text-fg-muted">{shownLabel}</span> : null}
      </div>
    </>
  );
}
