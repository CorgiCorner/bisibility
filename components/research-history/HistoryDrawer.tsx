"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import type { HistoryDayGroup, HistoryFilter, HistoryPage } from "@/lib/research-history/contract";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useDeferredValue, useId, useState } from "react";
import { HistoryRowList } from "./HistoryRowList";
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

export function HistoryDrawer({
  adapter,
  onClose,
  open,
}: Readonly<{ adapter: HistoryAdapter; onClose: () => void; open: boolean }>) {
  const t = useTranslations("researchHistory");
  const searchId = useId();
  const [query, setQuery] = useState("");
  // Paint the typed value first; the server search uses the deferred text.
  const deferredQuery = useDeferredValue(query);
  const [filters, setFilters] = useState<HistoryFilter[]>([]);
  const [client] = useState(() => new QueryClient());
  const filtersKey = JSON.stringify(filters);
  const first = useQuery(
    {
      enabled: open,
      queryFn: () => adapter.loadPage({ cursor: null, filters, query: deferredQuery }),
      queryKey: ["research-history-page", deferredQuery, filtersKey],
      retry: false,
    },
    client,
  );
  const [older, setOlder] = useState<HistoryPage[]>([]);
  const [olderError, setOlderError] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pins, setPins] = useState<ReadonlyMap<string, boolean>>(new Map());
  const scope = `${deferredQuery}\n${filtersKey}`;
  const [storedScope, setStoredScope] = useState(scope);
  if (storedScope !== scope) {
    setStoredScope(scope);
    setOlder([]);
    setOlderError(false);
    setPins(new Map());
  }
  const pages = first.data ? [first.data, ...older] : [];
  const groups = mergeGroups(pages);
  const timeZone = first.data?.timeZone ?? "UTC";
  const nextCursor = (older.at(-1) ?? first.data)?.nextCursor ?? null;
  const noun = adapter.noun;
  function choose(filter: HistoryFilter | null) {
    if (!filter) {
      setFilters([]);
      return;
    }
    setFilters((current) => {
      const rest = current.filter((item) => item.facet !== filter.facet);
      const active = current.some(
        (item) => item.facet === filter.facet && item.value === filter.value,
      );
      return active ? rest : [...rest, filter];
    });
  }
  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const next = await adapter.loadPage({ cursor: nextCursor, filters, query: deferredQuery });
      setOlder((current) => [...current, next]);
    } catch {
      setOlderError(true);
    } finally {
      setLoadingOlder(false);
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
  const count = first.data ? t(noun, { count: first.data.total }) : null;
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
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label={t("all")}
            onClick={() => choose(null)}
            selected={filters.length === 0}
          />
          <FilterChip
            label={t("pinned", { count: String(first.data?.pinnedCount ?? 0) })}
            onClick={() => choose({ facet: "pinned", value: "1" })}
            selected={filters.some((filter) => filter.facet === "pinned")}
          />
          {(first.data?.chips ?? []).map((chip) => (
            <FilterChip
              key={`${chip.facet}:${chip.value}`}
              label={adapter.chipLabel(chip)}
              onClick={() => choose(chip)}
              selected={filters.some(
                (filter) => filter.facet === chip.facet && filter.value === chip.value,
              )}
            />
          ))}
        </div>
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
        {first.isPending ? (
          <p className="m-0 text-ui-body text-fg-muted" role="status">
            {t("loading")}
          </p>
        ) : null}
        {!first.isPending && !first.isError && groups.length === 0 ? (
          <EmptyState
            compact
            description={t(noun === "runs" ? "emptyRuns" : "emptyChecks")}
            title={t("emptyTitle")}
          />
        ) : null}
        {groups.length > 0 ? (
          <HistoryRowList
            groups={groups}
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
            loading={loadingOlder}
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
}: Readonly<{ label: string; onClick: () => void; selected: boolean }>) {
  return selected ? (
    <Button
      aria-pressed
      className="rounded-full border border-border-control bg-accent-soft text-ui-caption text-accent-text hover:border-accent focus-visible:border-accent"
      onClick={onClick}
      size="input"
      type="button"
      variant="ghost"
    >
      {label}
    </Button>
  ) : (
    <Button
      aria-pressed={false}
      className="rounded-full border border-border-control bg-bg-elev text-ui-caption text-fg-muted hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text"
      onClick={onClick}
      size="input"
      type="button"
      variant="ghost"
    >
      {label}
    </Button>
  );
}
