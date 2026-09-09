"use client";

import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { type FeedFacet, type FeedFacetOptions, feedFacetAxes } from "@/lib/feeds/facets";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useState } from "react";

type AddFilterMenuProps = {
  facets: readonly FeedFacet[];
  onAdd: (facet: FeedFacet) => void;
  options: FeedFacetOptions;
};

export function AddFilterMenu({ facets, onAdd, options }: Readonly<AddFilterMenuProps>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const choices = feedFacetAxes.flatMap((axis) =>
    (options[axis] ?? [])
      .filter(
        (option) => !facets.some((facet) => facet.axis === axis && facet.value === option.value),
      )
      .map((option) => ({ axis, label: option.label, value: option.value })),
  );

  return (
    <>
      <button
        aria-expanded={Boolean(anchor)}
        aria-haspopup="menu"
        className="inline-flex min-h-8 items-center gap-1.5 rounded-control border border-dashed border-border-control bg-transparent px-3 text-[12px] font-semibold text-fg-muted transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:outline-none"
        onClick={(event) => setAnchor(event.currentTarget)}
        type="button"
      >
        <Plus aria-hidden size={13} weight="regular" />
        Add filter
      </button>
      <Menu
        anchorEl={anchor}
        align="start"
        side="bottom"
        onClose={() => setAnchor(null)}
        open={Boolean(anchor)}
        listProps={{ "aria-label": "Add feed filter" }}
      >
        {choices.map((choice) => (
          <MenuItem
            aria-label={`${choice.axis[0].toUpperCase() + choice.axis.slice(1)}: ${choice.label}`}
            key={`${choice.axis}:${choice.value}`}
            onClick={() => {
              onAdd({ axis: choice.axis, value: choice.value });
              setAnchor(null);
            }}
          >
            {choice.axis[0].toUpperCase() + choice.axis.slice(1)}: {choice.label}
          </MenuItem>
        ))}
        {choices.length === 0 ? <MenuItem disabled>No more filters</MenuItem> : null}
      </Menu>
    </>
  );
}
