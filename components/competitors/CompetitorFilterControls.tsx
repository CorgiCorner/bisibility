"use client";

import { filterChipStateClassName, MenuSelect } from "@/components/ui";
import { competitorPositionBuckets } from "@/lib/competitors/competitor-market-model";
import type { CompetitorFilter } from "@/lib/competitors/types";
import { TagIcon as Tag, XIcon as X } from "@phosphor-icons/react";

type CompetitorFilterControlsProps = {
  filter: CompetitorFilter;
  onFilterChange: (filter: CompetitorFilter) => void;
  tags: string[];
};

const bucketButtonClass =
  "rounded-lg border px-[11px] py-[5px] text-[11.5px] font-semibold outline-none transition-colors";

export function CompetitorFilterControls({
  filter,
  onFilterChange,
  tags,
}: Readonly<CompetitorFilterControlsProps>) {
  const tagOptions = [
    { label: "All tags", value: "" },
    ...tags.map((tag) => ({ label: tag, value: tag })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {competitorPositionBuckets.map((bucket) => {
        const selected = filter.position === bucket.id;
        return (
          <button
            aria-pressed={selected}
            className={`${bucketButtonClass} ${filterChipStateClassName(selected)}`}
            key={bucket.id}
            onClick={() => onFilterChange({ ...filter, position: bucket.id })}
            type="button"
          >
            {bucket.label}
          </button>
        );
      })}
      {tags.length > 0 ? (
        <span className="inline-flex items-center gap-1">
          <MenuSelect
            ariaLabel="Filter by tag"
            leadingIcon={<Tag aria-hidden size={12} />}
            onChange={(value) => onFilterChange({ ...filter, tag: value || null })}
            options={tagOptions}
            value={filter.tag ?? ""}
          />
          {filter.tag ? (
            <button
              aria-label="Remove tag filter"
              className="grid h-7 w-7 place-items-center rounded-lg border border-border-strong bg-bg-elev text-fg-muted outline-none transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text"
              onClick={() => onFilterChange({ ...filter, tag: null })}
              type="button"
            >
              <X aria-hidden size={12} weight="bold" />
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
