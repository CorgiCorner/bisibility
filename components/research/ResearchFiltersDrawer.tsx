"use client";

import {
  FilterCheckTile,
  FilterSection,
  toggleFilterValue,
} from "@/components/keywords/filters/FilterDrawerControls";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import {
  activeResearchFilterCount,
  emptyResearchFilters,
  type ResearchFilters,
} from "@/lib/keyword-research/view-model";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/dist/csr/ChartBar";
import { CompassIcon as Compass } from "@phosphor-icons/react/dist/csr/Compass";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/dist/csr/Funnel";
import { useFormatter, useTranslations } from "next-intl";

type ResearchFiltersDrawerProps = {
  filters: ResearchFilters;
  intentCounts?: Record<string, number>;
  onChange: (filters: ResearchFilters) => void;
  onClose: () => void;
  open: boolean;
  resultCount: number;
};

export function ResearchFiltersDrawer({
  filters,
  intentCounts,
  onChange,
  onClose,
  open,
  resultCount,
}: Readonly<ResearchFiltersDrawerProps>) {
  const t = useTranslations("projectResearch.filters");
  const format = useFormatter();
  const difficulties = [
    { id: "easy" as const, label: t("easy") },
    { id: "medium" as const, label: t("medium") },
    { id: "hard" as const, label: t("hard") },
  ];
  const intents = [
    { id: "informational", label: t("informational") },
    { id: "navigational", label: t("navigational") },
    { id: "commercial", label: t("commercial") },
    { id: "transactional", label: t("transactional") },
    { id: "unknown", label: t("unknown") },
  ];
  const sources = [
    { id: "related", label: t("related") },
    { id: "suggestion", label: t("suggestion") },
    { id: "idea", label: t("idea") },
  ];
  const activeCount = activeResearchFilterCount(filters);
  const patch = (value: Partial<ResearchFilters>) => onChange({ ...filters, ...value });

  return (
    <Sheet
      footer={
        <div className="flex items-center gap-2.5">
          <Button onClick={() => onChange(emptyResearchFilters)} type="button" variant="secondary">
            {t("reset")}
          </Button>
          <Button onClick={onClose} style={{ flex: 1 }} type="button">
            {t("showResults", { count: resultCount })}
          </Button>
        </div>
      }
      heightVariant="filters"
      onClose={onClose}
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          {t("title")}
          <span className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-accent-soft px-1.5 font-sans tabular-nums text-[10.5px] font-semibold text-accent-text">
            {activeCount}
          </span>
        </span>
      }
      widthVariant="filters"
    >
      <FilterSection icon={Compass} title={t("intent")}>
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
      <FilterSection icon={ChartBar} title={t("metrics")}>
        <div className="mb-2 mt-3 flex items-center justify-between text-[12px] text-fg-muted">
          <span>{t("minimumVolume")}</span>
          <span className="font-sans tabular-nums font-semibold text-accent-text">
            {format.number(filters.minVolume)}
          </span>
        </div>
        <Slider
          max={10000}
          min={0}
          onValueChange={(value) => patch({ minVolume: value as number })}
          step={100}
          style={{ color: "var(--accent)" }}
          value={filters.minVolume}
        />
        <div className="mb-2 mt-3 text-[12px] text-fg-muted">{t("difficulty")}</div>
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
      <FilterSection icon={Funnel} title={t("sourceTracking")}>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {sources.map((source) => (
            <FilterCheckTile
              active={filters.sources.includes(source.id)}
              key={source.id}
              label={source.label}
              onClick={() => patch({ sources: toggleFilterValue(filters.sources, source.id) })}
            />
          ))}
        </div>
        <div className="mt-4">
          <Switch
            checked={filters.hideTracked}
            label={t("hideTracked")}
            onChange={(event) => patch({ hideTracked: event.target.checked })}
          />
        </div>
      </FilterSection>
    </Sheet>
  );
}
