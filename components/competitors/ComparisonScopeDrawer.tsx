"use client";

import { AppDrawer, Button } from "@/components/ui";
import type { CompetitorFilter, CompetitorMarketData } from "@/lib/competitors/types";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import { useState } from "react";

type ComparisonScopeDrawerProps = {
  filter: CompetitorFilter;
  market: CompetitorMarketData;
  onChange: (filter: CompetitorFilter) => void;
  onClose: () => void;
  open: boolean;
};

export function ComparisonScopeDrawer({
  filter,
  market,
  onChange,
  onClose,
  open,
}: Readonly<ComparisonScopeDrawerProps>) {
  const [search, setSearch] = useState("");
  const excluded = new Set(filter.excludedKeywordIds);
  const normalizedSearch = search.trim().toLowerCase();
  const visible = market.observations.filter(
    (observation) =>
      !normalizedSearch ||
      observation.keyword.toLowerCase().includes(normalizedSearch) ||
      observation.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch)),
  );
  const included = market.observations.filter((observation) => !excluded.has(observation.id));
  const completed = included.filter((observation) => observation.completed).length;

  function setExcluded(next: Set<string>) {
    onChange({ ...filter, excludedKeywordIds: [...next].sort() });
  }

  return (
    <AppDrawer
      description="Choose the exact keyword set used by share of voice, head-to-head ranks, and CSV exports."
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-fg-faint">
            {included.length} included · {excluded.size} excluded
          </span>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
      onClose={onClose}
      open={open}
      title="Comparison scope"
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Tracked", market.observations.length],
            ["Included", included.length],
            ["Completed", completed],
            ["Pending", included.length - completed],
          ].map(([label, value]) => (
            <span className="rounded-[10px] border border-border bg-bg-sunken p-3" key={label}>
              <span className="block font-mono text-[9px] uppercase text-fg-faint">{label}</span>
              <span className="mt-1 block font-mono text-lg font-semibold">{value}</span>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <MagnifyingGlass
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint"
              size={14}
            />
            <input
              aria-label="Search comparison keywords"
              className="min-h-9 w-full rounded-[9px] border border-border-strong bg-bg-sunken pl-9 pr-3 text-[13px] outline-none focus:border-accent"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search keywords or tags"
              value={search}
            />
          </label>
          <Button onClick={() => setExcluded(new Set())} size="sm" variant="secondary">
            Include all
          </Button>
          <Button
            onClick={() => setExcluded(new Set([...excluded, ...visible.map((item) => item.id)]))}
            size="sm"
            variant="secondary"
          >
            Exclude visible
          </Button>
        </div>

        <div className="overflow-hidden rounded-[11px] border border-border">
          {visible.map((observation) => {
            const checked = !excluded.has(observation.id);
            return (
              <label
                className="flex cursor-pointer items-start gap-3 border-border-soft border-b px-3.5 py-3 last:border-b-0 hover:bg-nav-active"
                key={observation.id}
              >
                <input
                  checked={checked}
                  className="mt-0.5 accent-accent"
                  onChange={() => {
                    const next = new Set(excluded);
                    if (checked) next.add(observation.id);
                    else next.delete(observation.id);
                    setExcluded(next);
                  }}
                  type="checkbox"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {observation.keyword}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-fg-faint">
                    <span>{observation.completed ? "Check completed" : "Check pending"}</span>
                    {observation.tags.map((tag) => (
                      <span className="rounded bg-bg-sunken px-1.5 py-0.5" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </span>
                </span>
              </label>
            );
          })}
          {visible.length === 0 ? (
            <p className="m-0 px-4 py-6 text-center text-[13px] text-fg-muted">No matches</p>
          ) : null}
        </div>
      </div>
    </AppDrawer>
  );
}
