"use client";

import {
  FilterCheckTile,
  FilterSection,
  toggleFilterValue,
} from "@/components/keywords/filters/FilterDrawerControls";
import { Button, Sheet, Switch } from "@/components/ui";
import {
  activeResearchFilterCount,
  emptyResearchFilters,
  type ResearchFilters,
} from "@/lib/keyword-research/view-model";
import Slider from "@mui/material/Slider";
import {
  ChartBarIcon as ChartBar,
  CompassIcon as Compass,
  FunnelIcon as Funnel,
} from "@phosphor-icons/react";

type ResearchFiltersDrawerProps = {
  filters: ResearchFilters;
  intentCounts?: Record<string, number>;
  onChange: (filters: ResearchFilters) => void;
  onClose: () => void;
  open: boolean;
  resultCount: number;
};

const difficulties = [
  { id: "easy" as const, label: "Easy, 0-29" },
  { id: "medium" as const, label: "Medium, 30-69" },
  { id: "hard" as const, label: "Hard, 70-100" },
];
const intents = [
  { id: "informational", label: "Info" },
  { id: "navigational", label: "Nav" },
  { id: "commercial", label: "Comm" },
  { id: "transactional", label: "Trans" },
  { id: "unknown", label: "Unknown" },
];
const sources = ["related", "suggestion", "idea"];

export function ResearchFiltersDrawer({
  filters,
  intentCounts,
  onChange,
  onClose,
  open,
  resultCount,
}: Readonly<ResearchFiltersDrawerProps>) {
  const activeCount = activeResearchFilterCount(filters);
  const patch = (value: Partial<ResearchFilters>) => onChange({ ...filters, ...value });

  return (
    <Sheet
      footer={
        <div className="flex items-center gap-2.5">
          <Button onClick={() => onChange(emptyResearchFilters)} type="button" variant="secondary">
            Reset
          </Button>
          <Button onClick={onClose} sx={{ flex: 1 }} type="button">
            Show {resultCount} {resultCount === 1 ? "result" : "results"}
          </Button>
        </div>
      }
      heightVariant="filters"
      onClose={onClose}
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          Filters
          <span className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-accent-soft px-1.5 font-mono text-[10.5px] font-semibold text-accent">
            {activeCount}
          </span>
        </span>
      }
      widthVariant="filters"
    >
      <FilterSection icon={Compass} title="Search intent">
        <div className="mt-3 grid grid-cols-2 gap-2">
          {intents.map((intent) => (
            <FilterCheckTile
              active={filters.intents.includes(intent.id)}
              count={intentCounts?.[intent.id]}
              key={intent.id}
              label={intent.label}
              onClick={() => patch({ intents: toggleFilterValue(filters.intents, intent.id) })}
            />
          ))}
        </div>
      </FilterSection>
      <FilterSection icon={ChartBar} title="Metrics">
        <div className="mb-2 mt-3 flex items-center justify-between text-[12px] text-fg-muted">
          <span>Search volume / mo, minimum</span>
          <span className="font-mono font-semibold text-accent">
            {filters.minVolume.toLocaleString("en-US")}
          </span>
        </div>
        <Slider
          max={10_000}
          min={0}
          onChange={(_, value) => patch({ minVolume: value as number })}
          step={100}
          sx={{ color: "var(--accent)" }}
          value={filters.minVolume}
        />
        <div className="mb-2 mt-3 text-[12px] text-fg-muted">Keyword difficulty</div>
        <div className="grid grid-cols-1 gap-2">
          {difficulties.map((item) => (
            <FilterCheckTile
              active={filters.difficulty.includes(item.id)}
              key={item.id}
              label={item.label}
              onClick={() => patch({ difficulty: toggleFilterValue(filters.difficulty, item.id) })}
            />
          ))}
        </div>
      </FilterSection>
      <FilterSection icon={Funnel} title="Source and tracking">
        <div className="mt-3 grid grid-cols-1 gap-2">
          {sources.map((source) => (
            <FilterCheckTile
              active={filters.sources.includes(source)}
              key={source}
              label={source}
              onClick={() => patch({ sources: toggleFilterValue(filters.sources, source) })}
            />
          ))}
        </div>
        <div className="mt-4">
          <Switch
            checked={filters.hideTracked}
            label="Hide already tracked"
            onChange={(event) => patch({ hideTracked: event.target.checked })}
          />
        </div>
      </FilterSection>
    </Sheet>
  );
}
