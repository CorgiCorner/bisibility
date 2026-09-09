import { FacetBar } from "@/components/feeds/FacetBar";
import { AddNoteForm } from "@/components/timeline/AddNoteForm";
import { TimelineRow } from "@/components/timeline/TimelineRow";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { filterChipStateClassName } from "@/components/ui/filter-chip-styles";
import { compactInputTypographyClassName } from "@/components/ui/input-styles";
import { ModuleMark } from "@/components/ui/ModuleMark";
import type { DateFormatPreference } from "@/lib/format/user-datetime";
import type { TimelineFilterKey, TimelineView } from "@/lib/queries/timeline";
import { appPath } from "@/lib/routing/app-path";
import {
  type TimelineFilterView,
  type TimelineGroup,
  timelineFilters,
  timelineGroups,
} from "@/lib/timeline/timeline-data";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { FileDashedIcon as FileDashed } from "@phosphor-icons/react/dist/ssr/FileDashed";
import { FileMagnifyingGlassIcon as FileMagnifyingGlass } from "@phosphor-icons/react/dist/ssr/FileMagnifyingGlass";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { MedalIcon as Medal } from "@phosphor-icons/react/dist/ssr/Medal";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/dist/ssr/NotePencil";
import { RocketLaunchIcon as RocketLaunch } from "@phosphor-icons/react/dist/ssr/RocketLaunch";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import Link from "next/link";

type TimelineFeedProps = {
  canCreate: boolean;
  canDelete: boolean;
  dateFormat?: DateFormatPreference;
  projectId: string;
  projectRef: string;
  view: TimelineView;
};

const filterIcons = {
  all: Stack,
  deploys: RocketLaunch,
  notes: NotePencil,
  pages: FileMagnifyingGlass,
  rankings: Medal,
} satisfies Record<TimelineFilterKey, typeof Stack>;

function timelineHref({
  filter,
  facets = [],
  page = 1,
  projectRef,
  search,
}: {
  filter: TimelineFilterKey;
  facets?: TimelineView["facets"];
  page?: number;
  projectRef: string;
  search: string;
}) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  for (const facet of facets) params.append("f", `${facet.axis}:${facet.value}`);
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  const path = appPath(projectRef, "timeline");
  return query ? `${path}?${query}` : path;
}

function FilterChip({
  filter,
  facets,
  projectRef,
  search,
}: Readonly<{
  filter: TimelineFilterView;
  facets: TimelineView["facets"];
  projectRef: string;
  search: string;
}>) {
  const Icon = filterIcons[filter.icon];
  const selected = Boolean(filter.selected);

  return (
    <Link
      aria-current={selected ? "page" : undefined}
      className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-[12.5px] font-semibold outline-none transition-colors ${filterChipStateClassName(
        selected,
      )}`}
      href={timelineHref({ facets, filter: filter.key, projectRef, search })}
      prefetch={false}
    >
      <Icon aria-hidden size={14} weight="regular" />
      {filter.label}
      <span className="sr-only">{selected ? " selected" : " switch filter"}</span>
    </Link>
  );
}

function TimelineGroupCard({
  canDelete,
  group,
  projectId,
}: Readonly<{ canDelete: boolean; group: TimelineGroup; projectId: string }>) {
  return (
    <section>
      <div className="mb-[9px] font-sans tabular-nums text-[10px] uppercase tracking-[0.6px] text-fg-muted">
        {group.day}
      </div>
      <Card className="overflow-hidden p-0" size="lg">
        {group.items.map((item) => (
          <TimelineRow canDelete={canDelete} item={item} key={item.id} projectId={projectId} />
        ))}
      </Card>
    </section>
  );
}

function TimelineEmpty({
  facets,
  filtered,
  outOfRange,
  projectRef,
}: Readonly<{
  facets: TimelineView["facets"];
  filtered: boolean;
  outOfRange: boolean;
  projectRef: string;
}>) {
  if (outOfRange) {
    return (
      <EmptyState
        action={
          <Link
            className="inline-flex min-h-9 items-center rounded-control border border-accent bg-accent-solid px-3 text-[12px] font-semibold text-accent-on-solid"
            href={timelineHref({ facets, filter: "all", projectRef, search: "" })}
          >
            Back to page 1
          </Link>
        }
        description="This page has no timeline entries. Return to the first page to continue browsing."
        icon={<FileDashed weight="regular" aria-hidden size={24} />}
        title="No timeline entries on this page"
      />
    );
  }

  if (filtered) {
    return (
      <EmptyState
        description="Adjust the search or filter to see more timeline entries."
        icon={<MagnifyingGlass weight="regular" aria-hidden size={24} />}
        title="No matching timeline entries"
      />
    );
  }

  return (
    <EmptyState
      description="Rank changes, page events, deploys, and manual notes will appear here."
      mark={<ModuleMark bordered icon={ClockCounterClockwise} />}
      title="No timeline entries yet"
    />
  );
}

function Pagination({ projectRef, view }: Readonly<{ projectRef: string; view: TimelineView }>) {
  if (!view.hasNextPage && !view.hasPreviousPage) return null;

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Timeline pages">
      {view.hasPreviousPage ? (
        <Link
          className="inline-flex min-h-8 items-center rounded-control border border-border-control bg-bg-elev px-3 text-[12px] font-semibold text-fg-muted hover:border-accent hover:text-accent-text"
          href={timelineHref({
            facets: view.facets,
            filter: view.filter,
            page: view.page - 1,
            projectRef,
            search: view.search,
          })}
          prefetch={false}
        >
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="font-sans tabular-nums text-[11px] text-fg-muted">Page {view.page}</span>
      {view.hasNextPage ? (
        <Link
          className="inline-flex min-h-8 items-center rounded-control border border-border-control bg-bg-elev px-3 text-[12px] font-semibold text-fg-muted hover:border-accent hover:text-accent-text"
          href={timelineHref({
            facets: view.facets,
            filter: view.filter,
            page: view.page + 1,
            projectRef,
            search: view.search,
          })}
          prefetch={false}
        >
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function TimelineFeed({
  canCreate,
  canDelete,
  dateFormat,
  projectId,
  projectRef,
  view,
}: Readonly<TimelineFeedProps>) {
  const filters = timelineFilters(view);
  const facets = view.facets ?? [];
  const groups = timelineGroups(view.rows, view.now, {
    dateFormat,
    timezone: view.timeZone,
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <Card className="grid gap-3 p-4 sm:p-5" data-testid="timeline-controls">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <form
            action={appPath(projectRef, "timeline")}
            className="flex min-w-0 flex-1 items-center gap-2"
            method="get"
          >
            {view.filter !== "all" ? (
              <input name="filter" type="hidden" value={view.filter} />
            ) : null}
            {facets.map((facet) => (
              <input
                key={`${facet.axis}:${facet.value}`}
                name="f"
                type="hidden"
                value={`${facet.axis}:${facet.value}`}
              />
            ))}
            <label className="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-control border border-border-control bg-transparent px-3 transition-colors focus-within:border-accent">
              <MagnifyingGlass
                weight="regular"
                aria-hidden
                className="shrink-0 text-fg-muted"
                size={15}
              />
              <input
                aria-label="Search timeline"
                className={`${compactInputTypographyClassName} min-w-0 flex-1 bg-transparent font-sans tabular-nums text-fg outline-none focus-visible:outline-none`}
                defaultValue={view.search}
                name="q"
                placeholder="Search timeline (type, URL, note)..."
                type="search"
              />
            </label>
            <button
              className="inline-flex h-[34px] shrink-0 items-center justify-center rounded-control border border-border-control bg-bg-elev px-3 text-[12px] font-semibold text-fg-muted outline-none transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text"
              type="submit"
            >
              Search
            </button>
          </form>
          <AddNoteForm canCreate={canCreate} compact projectId={projectId} />
        </div>

        <div className="-mx-4 flex min-w-0 flex-wrap gap-[7px] border-t border-border px-4 pt-3 sm:-mx-5 sm:px-5">
          {filters.map((filter) => (
            <FilterChip
              filter={filter}
              facets={facets}
              key={filter.key}
              projectRef={projectRef}
              search={view.search}
            />
          ))}
        </div>
        {view.facetOptions ? <FacetBar facets={facets} options={view.facetOptions} /> : null}
      </Card>

      {groups.length > 0 ? (
        groups.map((group) => (
          <TimelineGroupCard
            canDelete={canDelete}
            group={group}
            key={group.day}
            projectId={projectId}
          />
        ))
      ) : (
        <TimelineEmpty
          facets={facets}
          filtered={view.isFiltered}
          outOfRange={view.page > 1}
          projectRef={projectRef}
        />
      )}

      <Pagination projectRef={projectRef} view={view} />
    </div>
  );
}
