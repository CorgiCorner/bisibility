"use client";

import {
  FilterSection,
  toggleFilterValue,
} from "@/components/keywords/filters/FilterDrawerControls";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { Slider } from "@/components/ui/Slider";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/dist/csr/ChartBar";
import { LinkIcon as Link } from "@phosphor-icons/react/dist/csr/Link";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/dist/csr/Prohibit";
import { TextTIcon as TextT } from "@phosphor-icons/react/dist/csr/TextT";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  activeBacklinksFilterCount,
  type BacklinksFilters,
  type BacklinksLinkType,
  backlinksLinkTypeOptions,
  emptyBacklinksFilters,
} from "./backlinks-filters-model";

type BacklinksFiltersDrawerProps = {
  draft: BacklinksFilters;
  linkTypeCounts: Record<BacklinksLinkType, number>;
  onApply: () => void;
  onChange: (filters: BacklinksFilters) => void;
  onClose: () => void;
  open: boolean;
  resultCount: number;
};

function RangeFilter({
  ariaLabel,
  max,
  onChange,
  title,
  value,
}: Readonly<{
  ariaLabel: string;
  max: number;
  onChange: (value: [number, number]) => void;
  title: string;
  value: [number, number];
}>) {
  return (
    <>
      <div className="mb-2 mt-3 flex items-center justify-between text-[12px] text-fg-muted">
        <span>{title}</span>
        <span className="font-sans tabular-nums text-[11px] font-semibold text-accent-text">
          {value[0]} - {value[1]}
        </span>
      </div>
      <Slider
        getAriaLabel={(index) => `${ariaLabel} ${index === 0 ? "minimum" : "maximum"}`}
        max={max}
        min={0}
        onValueChange={(next) => onChange(next as [number, number])}
        style={{
          marginLeft: 4,
          marginRight: 4,
          width: "calc(100% - 8px)",
        }}
        value={value}
      />
      <div className="flex justify-between font-sans tabular-nums text-[10px] text-fg-muted">
        <span>0</span>
        <span>{max}</span>
      </div>
    </>
  );
}

function TextFilter({
  icon,
  label,
  onChange,
  placeholder,
  value,
}: Readonly<{
  icon: ReactNode;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}>) {
  return (
    <label className="mt-3 block text-[12px] text-fg-muted">
      {label}
      <span className="mt-2 flex items-center gap-2 rounded-control border border-border-control bg-transparent px-[11px] py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid">
        <span aria-hidden className="text-fg-muted">
          {icon}
        </span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-sans tabular-nums text-[12.5px] text-fg outline-none placeholder:text-fg-muted"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
      </span>
    </label>
  );
}

export function BacklinksFiltersDrawer({
  draft,
  linkTypeCounts,
  onApply,
  onChange,
  onClose,
  open,
  resultCount,
}: Readonly<BacklinksFiltersDrawerProps>) {
  const t = useTranslations("projectBacklinks.workspace.filters");
  const activeCount = activeBacklinksFilterCount(draft);
  const patch = (value: Partial<BacklinksFilters>) => onChange({ ...draft, ...value });
  const firstSeenOptions = [
    { value: "any" as const, label: t("anyTime") },
    { value: "30" as const, label: t("days30") },
    { value: "90" as const, label: t("days90") },
  ];
  const linkTypeLabels: Record<BacklinksLinkType, string> = {
    dofollow: t("dofollow"),
    image: t("imageLinks"),
    nofollow: t("nofollow"),
    sitewide: t("sitewide"),
    sponsored: t("sponsored"),
    ugc: t("ugc"),
  };

  return (
    <Sheet
      footer={
        <div className="grid gap-3">
          <p className="m-0 text-[12px] leading-[1.5] text-fg-muted">{t("free")}</p>
          <div className="flex items-center gap-2.5">
            <Button
              onClick={() => onChange({ ...emptyBacklinksFilters })}
              type="button"
              variant="secondary"
            >
              {t("reset")}
            </Button>
            <Button
              endIcon={<CaretRight size={14} weight="regular" />}
              onClick={onApply}
              style={{ flex: 1 }}
            >
              {t("show", { count: resultCount, domains: t("domains", { count: resultCount }) })}
            </Button>
          </div>
        </div>
      }
      headerAction={
        <button
          className="rounded-control border-0 bg-transparent px-2.5 py-1.5 text-[12.5px] font-semibold text-fg-muted outline-none hover:text-accent-text focus-visible:text-accent-text"
          onClick={() => onChange({ ...emptyBacklinksFilters })}
          type="button"
        >
          {t("clearAll")}
        </button>
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
      <FilterSection icon={Link} title={t("linkType")}>
        <div className="mt-3 grid grid-cols-2 gap-[7px]">
          {backlinksLinkTypeOptions.map((option) => (
            <label
              className="flex cursor-pointer items-center gap-[9px] rounded-control border border-border-control bg-bg-elev px-[11px] py-[9px] hover:border-accent focus-within:border-accent"
              htmlFor={`backlinks-link-type-${option.id}`}
              key={option.id}
            >
              <Checkbox
                aria-label={linkTypeLabels[option.id]}
                checked={draft.linkTypes.includes(option.id)}
                id={`backlinks-link-type-${option.id}`}
                onChange={() => patch({ linkTypes: toggleFilterValue(draft.linkTypes, option.id) })}
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">
                {linkTypeLabels[option.id]}
              </span>
              <span className="font-sans tabular-nums text-[11px] text-fg-muted">
                {linkTypeCounts[option.id]}
              </span>
            </label>
          ))}
        </div>
      </FilterSection>
      <FilterSection icon={ChartBar} title={t("metrics")}>
        <RangeFilter
          ariaLabel={t("domainAuthority")}
          max={100}
          onChange={(domainAuthority) => patch({ domainAuthority })}
          title={t("domainAuthority")}
          value={draft.domainAuthority}
        />
        <RangeFilter
          ariaLabel={t("spamScore")}
          max={10}
          onChange={(spamScore) => patch({ spamScore })}
          title={t("spamScore")}
          value={draft.spamScore}
        />
      </FilterSection>
      <FilterSection icon={CalendarBlank} title={t("firstSeen")}>
        <SegmentedControl
          ariaLabel={t("firstSeen")}
          className="mt-3"
          onChange={(firstSeen) => patch({ firstSeen })}
          options={firstSeenOptions}
          size="field"
          value={draft.firstSeen}
        />
      </FilterSection>
      <FilterSection icon={TextT} title={t("textMatch")}>
        <TextFilter
          icon={<TextT weight="regular" size={14} />}
          label={t("anchorContains")}
          onChange={(anchorContains) => patch({ anchorContains })}
          placeholder={t("anchorPlaceholder")}
          value={draft.anchorContains}
        />
        <TextFilter
          icon={<ArrowRight weight="regular" size={14} />}
          label={t("targetContains")}
          onChange={(targetUrlContains) => patch({ targetUrlContains })}
          placeholder={t("targetPlaceholder")}
          value={draft.targetUrlContains}
        />
        <TextFilter
          icon={<Prohibit weight="regular" size={14} />}
          label={t("excludeDomain")}
          onChange={(excludeDomain) => patch({ excludeDomain })}
          placeholder={t("excludePlaceholder")}
          value={draft.excludeDomain}
        />
      </FilterSection>
    </Sheet>
  );
}
