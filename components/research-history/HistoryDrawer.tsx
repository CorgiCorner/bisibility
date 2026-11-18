"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import type { HistoryDayGroup, HistoryFilter, HistoryPage } from "@/lib/research-history/contract";
import { cn } from "@/lib/ui/cn";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { keepPreviousData, QueryClient, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type ReactNode, useDeferredValue, useId, useState } from "react";
import { HistoryRowList, HistoryRowsLoading } from "./HistoryRowList";
import type { HistoryAdapter } from "./history-adapter";

function mergeGroups(pages: readonly HistoryPage[]) {
  const groups: HistoryDayGroup[] = [];
  for (const page of pages) {
    for (const group of page.groups) {
      const last = groups.at(-1);
      if (last?.day === group.day) last.rows.push(...group.rows);
      else groups.push({ ...group, rows: [...group.rows] });
    }
  }
  return groups;
}

export function historyPageKey(query: string, filtersKey: string) {
  return ["research-history-page", query, filtersKey] as const;
}

export function HistoryDrawer({
  adapter,
  cache,
  onClose,
  open,
  summary,
}: Readonly<{
  adapter: HistoryAdapter;
  cache?: QueryClient;
  onClose: () => void;
  open: boolean;
  summary?: HistoryPage;
}>) {
  const t = useTranslations("researchHistory");
  const searchId = useId();
  const [query, setQuery] = useState("");
  // Paint the typed value first; the server search uses the deferred text.
  const deferredQuery = useDeferredValue(query);
  const [filters, setFilters] = useState<HistoryFilter[]>([]);
  const [client] = useState(() => cache ?? new QueryClient());
  const filtersKey = JSON.stringify(filters);
  const first = useQuery(
    {
      enabled: open,
      queryFn: () => adapter.loadPage({ cursor: null, filters, query: deferredQuery }),
      queryKey: historyPageKey(deferredQuery, filtersKey),
      placeholderData: keepPreviousData,
      retry: false,
    },
    client,
  );
  const scope = `${deferredQuery}\n${filtersKey}`;
  const [pagination, setPagination] = useState({
    scope,
    pages: [] as HistoryPage[],
    error: false,
    request: null as object | null,
  });
  const [pins, setPins] = useState<ReadonlyMap<string, boolean>>(new Map());
  if (pagination.scope !== scope) {
    setPagination({ scope, pages: [], error: false, request: null });
  }
  const { pages: older, error: olderError, request } = pagination;
  const pages = first.data ? [first.data, ...older] : [];
  const groups = mergeGroups(pages);
  const timeZone = first.data?.timeZone ?? "UTC";
  const nextCursor = first.isPlaceholderData
    ? null
    : ((older.at(-1) ?? first.data)?.nextCursor ?? null);
  function selectFacet(facet: HistoryFilter["facet"], value: string) {
    setFilters((current) => {
      const rest = current.filter((item) => item.facet !== facet);
      return value ? [...rest, { facet, value }] : rest;
    });
  }
  async function loadOlder() {
    if (!nextCursor || request) return;
    const pending = {};
    setPagination((current) => ({ ...current, request: pending, error: false }));
    try {
      const next = await adapter.loadPage({ cursor: nextCursor, filters, query: deferredQuery });
      setPagination((current) =>
        current.request === pending
          ? { ...current, pages: [...current.pages, next], request: null }
          : current,
      );
    } catch {
      setPagination((current) =>
        current.request === pending ? { ...current, error: true, request: null } : current,
      );
    }
  }
  async function toggle(row: (typeof groups)[number]["rows"][number]) {
    const next = !(pins.get(row.key) ?? row.pinned);
    setPins((current) => new Map(current).set(row.key, next));
    if (!(await adapter.onTogglePin(row, next))) {
      setPins((current) => {
        const copy = new Map(current);
        copy.delete(row.key);
        return copy;
      });
    }
  }
  const { noun } = adapter;
  const total = first.data?.total;
  const count =
    total === undefined
      ? null
      : noun === "checks"
        ? t("checks", { count: total })
        : t("runs", { count: total });
  const selected = new Map(filters.map(({ facet, value }) => [facet, value]));
  const isPinned = selected.has("pinned");
  const isFiltered = filters.length > 0 || deferredQuery.trim() !== "";
  const facets = summary ?? first.data;
  const pinnedLabel = facets ? t("pinned", { count: String(facets.pinnedCount) }) : t("pinnedTab");
  const modelOption = adapter.modelOption;
  const modelOptions = modelOption
    ? (facets?.chips
        .filter((chip) => chip.facet === "engine")
        .map((chip) => modelOption(chip.value)) ?? [])
    : [];
  return (
    <Sheet
      closeLabel={t("close")}
      footer={
        adapter.allHref ? (
          <Button
            endIcon={<ArrowRight aria-hidden size={14} weight="regular" />}
            href={adapter.allHref}
            size="input"
            variant="ghost"
          >
            {t("openAllRuns")}
          </Button>
        ) : null
      }
      heightVariant="filters"
      onClose={onClose}
      open={open}
      title={
        <span className="flex min-w-0 items-baseline gap-2">
          <span>{t("title")}</span>
          {count ? (
            <span className="text-ui-caption font-normal text-fg-muted tabular-nums">{count}</span>
          ) : null}
        </span>
      }
      widthVariant="filters"
    >
      <div className="grid gap-3">
        <Input
          aria-label={t("searchLabel")}
          id={searchId}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={adapter.searchPlaceholder}
          value={query}
        />
        {modelOption ? (
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
            <SegmentedControl
              ariaLabel={t("title")}
              fitContent
              onChange={(value) => selectFacet("pinned", value === "pinned" ? "1" : "")}
              options={[
                { label: t("all"), value: "all" },
                { label: pinnedLabel, value: "pinned" },
              ]}
              size="field"
              value={isPinned ? "pinned" : "all"}
            />
            <MenuSelect
              ariaLabel={t("filterModel")}
              disabled={modelOptions.length === 0}
              matchTriggerWidth
              onChange={(value) => selectFacet("engine", value)}
              options={[{ label: t("allModels"), value: "" }, ...modelOptions]}
              searchable
              searchPlaceholder={t("searchModels")}
              size="input"
              triggerClassName="min-w-0"
              triggerWrapperClassName="min-w-0"
              value={selected.get("engine") ?? ""}
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <FilterChip
              label={t("all")}
              onClick={() => setFilters([])}
              selected={filters.length === 0}
            />
            <FilterChip
              label={t("pinned", { count: String(first.data?.pinnedCount ?? 0) })}
              onClick={() => selectFacet("pinned", isPinned ? "" : "1")}
              selected={isPinned}
            />
            {first.data?.chips.map((chip) => {
              const active = selected.get(chip.facet) === chip.value;
              return (
                <FilterChip
                  key={`${chip.facet}:${chip.value}`}
                  label={adapter.chipLabel(chip)}
                  onClick={() => selectFacet(chip.facet, active ? "" : chip.value)}
                  selected={active}
                />
              );
            })}
          </div>
        )}
        {first.isError || olderError ? (
          <p className="m-0 text-ui-body text-fg-muted" role="alert">
            {t("error")}{" "}
            <Button
              onClick={() => void (olderError ? loadOlder() : first.refetch())}
              size="input"
              type="button"
              variant="ghost"
            >
              {t("retry")}
            </Button>
          </p>
        ) : null}
        {first.isFetching ? (
          <span className="sr-only" role="status">
            {t("loading")}
          </span>
        ) : null}
        {first.isPending && open ? <HistoryRowsLoading /> : null}
        {!first.isPending && !first.isPlaceholderData && !first.isError && groups.length === 0 ? (
          <EmptyState
            compact
            description={t(
              isFiltered ? "noMatchesDescription" : noun === "runs" ? "emptyRuns" : "emptyChecks",
            )}
            title={t(isFiltered ? "noMatches" : "emptyTitle")}
          />
        ) : null}
        {groups.length > 0 ? (
          <HistoryRowList
            groups={groups}
            openHref={adapter.openHref}
            onOpen={(row) => {
              void adapter.onOpen(row);
              onClose();
            }}
            onTogglePin={(row) => void toggle(row)}
            pinned={(row) => pins.get(row.key) ?? row.pinned}
            renderMeta={adapter.renderMeta}
            timeZone={timeZone}
          />
        ) : null}
        {nextCursor ? (
          <Button
            className="justify-self-start"
            loading={Boolean(request)}
            onClick={() => void loadOlder()}
            size="input"
            type="button"
            variant="ghost"
          >
            {t(noun === "runs" ? "loadOlderRuns" : "loadOlderChecks")}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

function FilterChip({
  label,
  onClick,
  selected,
}: Readonly<{ label: ReactNode; onClick: () => void; selected: boolean }>) {
  return (
    <Button
      aria-pressed={selected}
      className={cn(
        "rounded-full border border-border-control text-ui-caption hover:border-accent focus-visible:border-accent",
        selected
          ? "bg-accent-soft text-accent-text"
          : "bg-bg-elev text-fg-muted hover:text-accent-text focus-visible:text-accent-text",
      )}
      onClick={onClick}
      size="input"
      type="button"
      variant="ghost"
    >
      {label}
    </Button>
  );
}
