"use client";

import { KeywordsScopeLocationSelect } from "@/components/keywords/KeywordsScopeControls";
import { Button, Sheet } from "@/components/ui";
import {
  type ChangeFilter,
  changeOptions,
  emptyKeywordFilters,
  type KeywordFilters,
  type LastCheckFilter,
  lastCheckOptions,
  type PositionBucketId,
  serpFeatures,
} from "@/lib/keywords/keyword-filter-model";
import type { ActiveLens, LensLocationOption } from "@/lib/keywords/lens-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import Slider from "@mui/material/Slider";
import {
  ChartLineUpIcon as ChartLineUp,
  ImageIcon as Image,
  LinkSimpleIcon as LinkSimple,
  ListBulletsIcon as ListBullets,
  MagnifyingGlassIcon as MagnifyingGlass,
  MapPinIcon as MapPin,
  PlayCircleIcon as PlayCircle,
  QuestionIcon as Question,
  QuotesIcon as Quotes,
  SparkleIcon as Sparkle,
  TagIcon as Tag,
  TextAaIcon as TextAa,
} from "@phosphor-icons/react";
import {
  FilterCheckTile,
  type FilterIcon,
  FilterSection,
  FilterSegment,
  toggleFilterValue,
} from "./FilterDrawerControls";
import { FilterFacetPillSection } from "./FilterFacetPillSection";
import { getFilterFacets } from "./keyword-filter-facets";
import { UrlFilterToggle } from "./UrlFilterToggle";

type FiltersDrawerProps = {
  basePath: string;
  filters: KeywordFilters;
  lens?: ActiveLens;
  locationOptions?: LensLocationOption[];
  onChange: (filters: KeywordFilters) => void;
  onClose: () => void;
  open: boolean;
  rows: KeywordRow[];
  viewId?: string | null;
};

const serpIcons: Record<string, FilterIcon> = {
  ai: Sparkle,
  featured: Quotes,
  image: Image,
  paa: Question,
  sitelinks: ListBullets,
  video: PlayCircle,
};

export function FiltersDrawer({
  basePath,
  filters,
  lens,
  locationOptions = [],
  onChange,
  onClose,
  open,
  rows,
  viewId = null,
}: Readonly<FiltersDrawerProps>) {
  const facets = getFilterFacets(rows);
  const activeCount =
    filters.position.length +
    (filters.change === "any" ? 0 : 1) +
    (filters.volMin > 0 || filters.volMax < 50 ? 1 : 0) +
    (filters.contains ? 1 : 0) +
    filters.tags.length +
    filters.topics.length +
    filters.intents.length +
    filters.serp.length +
    (filters.lastCheck === "any" ? 0 : 1) +
    (filters.wrongUrl ? 1 : 0) +
    (filters.urlChanged ? 1 : 0);

  function patch(patchValue: Partial<KeywordFilters>) {
    onChange({ ...filters, ...patchValue });
  }

  return (
    <Sheet
      footer={
        <div className="flex items-center gap-2.5">
          <Button onClick={() => onChange(emptyKeywordFilters)} type="button" variant="secondary">
            Reset
          </Button>
          <Button onClick={onClose} sx={{ flex: 1 }} type="button">
            Show results
          </Button>
        </div>
      }
      heightVariant="filters"
      onClose={onClose}
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          {"Filters "}
          <span className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-accent-soft px-1.5 font-mono text-[10.5px] font-semibold text-accent">
            {activeCount}
          </span>
        </span>
      }
      widthVariant="filters"
    >
      <div className="-mt-1">
        {lens ? (
          <div className="sm:hidden">
            <FilterSection icon={MapPin} title="Scope">
              <div className="mt-[13px]">
                <KeywordsScopeLocationSelect
                  basePath={basePath}
                  lens={lens}
                  locationOptions={locationOptions}
                  triggerClassName="w-full justify-between bg-bg-sunken"
                  viewId={viewId}
                />
              </div>
            </FilterSection>
          </div>
        ) : null}

        <FilterSection icon={ChartLineUp} title="Ranking data">
          <div className="mb-2 mt-[11px] text-[12px] text-fg-muted">Current position</div>
          <div className="grid grid-cols-2 gap-[7px]">
            {facets.positions.map((bucket) => (
              <FilterCheckTile
                active={filters.position.includes(bucket.id)}
                count={bucket.count}
                key={bucket.id}
                label={bucket.label}
                onClick={() =>
                  patch({
                    position: toggleFilterValue(filters.position, bucket.id as PositionBucketId),
                  })
                }
              />
            ))}
          </div>
          <div className="mb-2 mt-4 text-[12px] text-fg-muted">Position change / 7d</div>
          <FilterSegment<ChangeFilter>
            onChange={(change) => patch({ change })}
            options={changeOptions}
            value={filters.change}
          />
          <div className="mb-2 mt-4 text-[12px] text-fg-muted">Last check</div>
          <FilterSegment<LastCheckFilter>
            onChange={(lastCheck) => patch({ lastCheck })}
            options={lastCheckOptions}
            value={filters.lastCheck}
          />
        </FilterSection>

        <FilterSection icon={TextAa} title="Keyword attributes">
          <div className="mb-2 mt-[13px] flex items-center justify-between">
            <span className="text-[12px] text-fg-muted">Search volume / mo</span>
            <span className="font-mono text-[11px] font-semibold text-accent">
              {filters.volMin}k - {filters.volMax >= 50 ? "50k+" : `${filters.volMax}k`}
            </span>
          </div>
          <Slider
            max={50}
            min={0}
            onChange={(_, value) => {
              const [volMin, volMax] = value as number[];
              patch({ volMax, volMin });
            }}
            size="small"
            sx={{ color: "var(--accent)", mx: 0.5 }}
            value={[filters.volMin, filters.volMax]}
          />
          <div className="flex justify-between font-mono text-[10px] text-fg-faint">
            <span>0</span>
            <span>50k+</span>
          </div>
          <label className="mt-4 block text-[12px] text-fg-muted" htmlFor="keyword-contains">
            Keyword contains
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-[9px] border border-border-strong bg-bg-sunken px-[11px] py-2 transition-colors focus-within:border-accent">
            <TextAa className="text-fg-faint" size={14} />
            <input
              className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-fg outline-none focus-visible:outline-none"
              id="keyword-contains"
              onChange={(event) => patch({ contains: event.target.value })}
              placeholder="e.g. open source"
              value={filters.contains}
            />
          </div>
        </FilterSection>

        <FilterSection icon={MagnifyingGlass} title="SERP features">
          <div className="mt-[13px] grid grid-cols-2 gap-[7px]">
            {serpFeatures.map((feature) => (
              <FilterCheckTile
                active={filters.serp.includes(feature.id)}
                icon={serpIcons[feature.id]}
                key={feature.id}
                label={feature.label}
                onClick={() => patch({ serp: toggleFilterValue(filters.serp, feature.id) })}
              />
            ))}
          </div>
        </FilterSection>

        <FilterFacetPillSection
          facets={facets.tags}
          icon={Tag}
          onChange={(tags) => patch({ tags })}
          title="Tags"
          values={filters.tags}
        />
        <FilterFacetPillSection
          facets={facets.topics}
          icon={ListBullets}
          onChange={(topics) => patch({ topics })}
          title="Topics"
          values={filters.topics}
        />
        <FilterFacetPillSection
          facets={facets.intents}
          icon={Sparkle}
          onChange={(intents) => patch({ intents })}
          title="Intent"
          values={filters.intents}
        />

        <FilterSection icon={LinkSimple} title="URLs">
          <div className="mt-[13px] grid gap-4">
            <UrlFilterToggle
              active={filters.wrongUrl}
              description="Ranking URL differs from target URL"
              label="Wrong URL ranking"
              onClick={() => patch({ wrongUrl: !filters.wrongUrl })}
            />
            <UrlFilterToggle
              active={filters.urlChanged}
              description="More than one URL ranked during the tracked history"
              label="Ranking URL changed"
              onClick={() => patch({ urlChanged: !filters.urlChanged })}
            />
          </div>
        </FilterSection>
      </div>
    </Sheet>
  );
}
