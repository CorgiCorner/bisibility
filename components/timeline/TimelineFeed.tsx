import { AddNoteForm } from "@/components/timeline/AddNoteForm";
import { TimelineRow } from "@/components/timeline/TimelineRow";
import {
  Card,
  EmptyState,
  filterChipStateClassName,
  MonoText,
  SectionTitle,
} from "@/components/ui";
import type { DateTimePreferences } from "@/lib/format/user-datetime";
import type { TimelineFilterKey, TimelineView } from "@/lib/queries/timeline";
import { appPath } from "@/lib/routing/app-path";
import {
  type TimelineFilterView,
  type TimelineGroup,
  timelineFilters,
  timelineGroups,
} from "@/lib/timeline/timeline-data";
import {
  FileMagnifyingGlassIcon as FileMagnifyingGlass,
  InfoIcon as Info,
  MagnifyingGlassIcon as MagnifyingGlass,
  MedalIcon as Medal,
  NotePencilIcon as NotePencil,
  RocketLaunchIcon as RocketLaunch,
  SlidersHorizontalIcon as SlidersHorizontal,
  StackIcon as Stack,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

type TimelineFeedProps = {
  canCreate: boolean;
  canDelete: boolean;
  preferences?: DateTimePreferences;
  projectId: string;
  projectRef: string;
  view: TimelineView;
};

const TOOLTIP =
  "Signals combine rank checks, page events, deploys, and manual notes into one project timeline.";

const filterIcons = {
  all: Stack,
  deploys: RocketLaunch,
  notes: NotePencil,
  pages: FileMagnifyingGlass,
  rankings: Medal,
} satisfies Record<TimelineFilterKey, typeof Stack>;

function timelineHref({
  filter,
  page = 1,
  projectRef,
  search,
}: {
  filter: TimelineFilterKey;
  page?: number;
  projectRef: string;
  search: string;
}) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  const path = appPath(projectRef, "timeline");
  return query ? `${path}?${query}` : path;
}

function FilterChip({
  filter,
  projectRef,
  search,
}: Readonly<{
  filter: TimelineFilterView;
  projectRef: string;
  search: string;
}>) {
  const Icon = filterIcons[filter.icon];
  const selected = Boolean(filter.selected);

  return (
    <Link
      aria-current={selected ? "page" : undefined}
      className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[12.5px] font-semibold outline-none transition-colors ${filterChipStateClassName(
        selected,
      )}`}
      href={timelineHref({ filter: filter.key, projectRef, search })}
      prefetch={false}
    >
      <Icon aria-hidden size={14} />
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
      <div className="mb-[9px] font-mono text-[10px] uppercase tracking-[0.6px] text-fg-faint">
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
  filtered,
  outOfRange,
  projectRef,
}: Readonly<{ filtered: boolean; outOfRange: boolean; projectRef: string }>) {
  if (outOfRange) {
    return (
      <EmptyState
        action={
          <Link
            className="inline-flex min-h-9 items-center rounded-lg border border-accent bg-accent px-3 text-[12px] font-semibold text-white"
            href={appPath(projectRef, "timeline")}
          >
            Back to page 1
          </Link>
        }
        description="This page has no timeline entries. Return to the first page to continue browsing."
        icon={<SlidersHorizontal aria-hidden size={24} weight="fill" />}
        title="No timeline entries on this page"
      />
    );
  }

  return (
    <EmptyState
      description={
        filtered
          ? "Adjust the search or filter to see more timeline entries."
          : "Rank changes, page events, deploys, and manual notes will appear here."
      }
      icon={<SlidersHorizontal aria-hidden size={24} weight="fill" />}
      title={filtered ? "No matching timeline entries" : "No timeline entries yet"}
    />
  );
}

function Pagination({ projectRef, view }: Readonly<{ projectRef: string; view: TimelineView }>) {
  if (!view.hasNextPage && !view.hasPreviousPage) return null;

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Timeline pages">
      {view.hasPreviousPage ? (
        <Link
          className="inline-flex min-h-8 items-center rounded-lg border border-border-strong bg-bg-elev px-3 text-[12px] font-semibold text-fg-muted hover:border-accent hover:text-accent"
          href={timelineHref({
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
      <span className="font-mono text-[11px] text-fg-faint">Page {view.page}</span>
      {view.hasNextPage ? (
        <Link
          className="inline-flex min-h-8 items-center rounded-lg border border-border-strong bg-bg-elev px-3 text-[12px] font-semibold text-fg-muted hover:border-accent hover:text-accent"
          href={timelineHref({
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
  preferences,
  projectId,
  projectRef,
  view,
}: Readonly<TimelineFeedProps>) {
  const filters = timelineFilters(view);
  const groups = timelineGroups(view.rows, view.now, preferences);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SectionTitle>Timeline</SectionTitle>
            <button
              aria-label={TOOLTIP}
              className="bv-tip inline-grid h-4 w-4 cursor-help place-items-center border-0 bg-transparent p-0 text-fg-faint"
              data-tip={TOOLTIP}
              type="button"
            >
              <Info size={14} />
            </button>
          </div>
          <MonoText muted>Newest project signals first</MonoText>
        </div>
        <AddNoteForm canCreate={canCreate} projectId={projectId} />
      </div>

      <form
        action={appPath(projectRef, "timeline")}
        className="flex min-h-10 items-center gap-2"
        method="get"
      >
        {view.filter !== "all" ? <input name="filter" type="hidden" value={view.filter} /> : null}
        <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-border-strong bg-bg-sunken px-3 transition-colors focus-within:border-accent">
          <MagnifyingGlass aria-hidden className="shrink-0 text-fg-faint" size={15} />
          <input
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-fg outline-none focus-visible:outline-none placeholder:text-fg-faint"
            defaultValue={view.search}
            name="q"
            placeholder="Search timeline (type, URL, note)..."
            type="search"
          />
        </label>
        <button
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-bg-elev px-3 text-[12px] font-semibold text-fg-muted outline-none transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent"
          type="submit"
        >
          Search
        </button>
      </form>

      <div className="flex min-w-0 flex-wrap gap-[7px]">
        {filters.map((filter) => (
          <FilterChip
            filter={filter}
            key={filter.key}
            projectRef={projectRef}
            search={view.search}
          />
        ))}
      </div>

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
          filtered={view.isFiltered}
          outOfRange={view.page > 1}
          projectRef={projectRef}
        />
      )}

      <Pagination projectRef={projectRef} view={view} />
    </div>
  );
}
