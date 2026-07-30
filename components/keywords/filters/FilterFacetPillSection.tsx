"use client";

import { Pill } from "@/components/ui";
import { type FilterIcon, FilterSection, toggleFilterValue } from "./FilterDrawerControls";

type FilterFacetPillSectionProps = {
  facets: { count: number; label: string }[];
  icon: FilterIcon;
  onChange: (values: string[]) => void;
  title: string;
  values: string[];
};

export function FilterFacetPillSection({
  facets,
  icon,
  onChange,
  title,
  values,
}: Readonly<FilterFacetPillSectionProps>) {
  if (facets.length === 0) return null;
  return (
    <FilterSection icon={icon} title={title}>
      <div className="mt-[13px] flex flex-wrap gap-[7px]">
        {facets.map((facet) => {
          const active = values.includes(facet.label);
          return (
            <Pill
              active={active}
              aria-pressed={active}
              key={facet.label}
              onClick={() => onChange(toggleFilterValue(values, facet.label))}
              size="sm"
              type="button"
            >
              {facet.label}
              <span className="font-mono text-[10px] opacity-70">{facet.count}</span>
            </Pill>
          );
        })}
      </div>
    </FilterSection>
  );
}
