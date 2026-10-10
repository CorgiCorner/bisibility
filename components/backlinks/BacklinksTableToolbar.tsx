import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/ui/cn";
import { FunnelSimpleIcon as FunnelSimple } from "@phosphor-icons/react/dist/csr/FunnelSimple";
import { useTranslations } from "next-intl";
import type { KeyboardEvent, ReactNode } from "react";
import type { BacklinksFilter, BacklinksSlice, BacklinksView } from "./backlinks-table-model";

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
  "focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid";

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
  const t = useTranslations("projectBacklinks.workspace.table");
  const views: { id: BacklinksView; label: string; title?: string }[] = [
    { id: "backlinks", label: t("backlinks") },
    { id: "referring_domains", label: t("referringDomains"), title: t("referringDomainsHint") },
    { id: "top_pages", label: t("topPages"), title: t("topPagesHint") },
    { id: "anchors", label: t("anchors"), title: t("anchorsHint") },
  ];
  const filters: { id: BacklinksFilter; label: string }[] = [
    { id: "all", label: t("all") },
    { id: "new", label: t("new30Days") },
    { id: "lost", label: t("lost30Days") },
    { id: "broken", label: t("broken") },
  ];
  const slices = [
    { label: t("onePerDomain"), value: "one_per_domain" },
    { label: t("allLinks"), value: "all_links" },
  ] satisfies SegmentedControlOption<BacklinksSlice>[];
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
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-4">
        <div
          aria-label={t("viewsAria")}
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
          ariaLabel={t("rowGroupingAria")}
          className="my-1"
          fitContent
          onChange={onSliceChange}
          options={slices}
          size="xs"
          value={slice}
        />
        {exportControl}
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2.5 px-4 py-2.5",
          filter === "broken" && "border-b border-border",
        )}
      >
        <button
          aria-label={t("filtersAria", { count: filterCount })}
          className={`inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-control border border-border-control bg-transparent px-3 text-[13px] font-medium text-fg hover:border-fg-muted ${focusClass}`}
          onClick={onOpenFilters}
          type="button"
        >
          <FunnelSimple aria-hidden size={13} weight="regular" />
          {t("filters")}
          <span className="grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent-soft px-1 font-sans tabular-nums text-[10px] font-semibold text-accent-text">
            {filterCount}
          </span>
        </button>
        {filters.map((item) => (
          <button
            aria-label={
              item.id === "broken"
                ? `${item.label} ${counts[item.id]}`
                : t("filterAria", {
                    count: counts[item.id],
                    domains: t("domains", { count: counts[item.id] }),
                    label: item.label,
                  })
            }
            aria-pressed={filter === item.id}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] hover:border-fg-muted ${focusClass} ${
              filter === item.id
                ? "border-border-control bg-transparent font-semibold text-fg"
                : "border-border bg-transparent text-fg-muted"
            }`}
            key={item.id}
            onClick={() => onFilterChange(item.id)}
            type="button"
          >
            {item.label}
            <span className="font-sans tabular-nums text-[11px] text-fg-muted">
              {counts[item.id]}
            </span>
            {item.id !== "broken" ? (
              <span className="text-[10px] text-fg-muted">
                {t("domains", { count: counts[item.id] })}
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
