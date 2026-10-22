"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { useTranslations } from "next-intl";

function options(values: readonly string[], allLabel: string) {
  return [{ label: allLabel, value: "all" }, ...values.map((value) => ({ label: value, value }))];
}

export function ScheduleKeywordFilters({
  device,
  market,
  tag,
  search,
  devices,
  markets,
  tags,
  matchingCount,
  onDeviceChange,
  onMarketChange,
  onTagChange,
  onSearchChange,
}: Readonly<{
  device: string;
  market: string;
  tag: string;
  search: string;
  devices: readonly string[];
  markets: readonly string[];
  tags: readonly string[];
  matchingCount: number;
  onDeviceChange: (value: string) => void;
  onMarketChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onSearchChange: (value: string) => void;
}>) {
  const t = useTranslations("projectRuns.schedules");
  const activeFilters = tag !== "all" || market !== "all" || device !== "all";
  return (
    <div className="flex flex-col gap-2.5 border-b border-border pb-3.5">
      <ToolbarSearch
        id="schedule-keyword-search"
        label={t("searchKeywords")}
        onChange={onSearchChange}
        placeholder={t("searchKeywords")}
        value={search}
        variant="outlined"
      />
      <div className="flex flex-wrap gap-1.5">
        <MenuSelect
          ariaLabel={t("tag")}
          compact
          onChange={onTagChange}
          options={options(tags, t("allTags"))}
          selectedContent={(option) =>
            option?.value === "all" ? t("tag") : `${t("tag")}: ${option?.label}`
          }
          triggerClassName="min-h-7 rounded-full px-2.5 text-[11.5px] font-semibold"
          value={tag}
        />
        <MenuSelect
          ariaLabel={t("market")}
          compact
          onChange={onMarketChange}
          options={options(markets, t("allMarkets"))}
          selectedContent={(option) =>
            option?.value === "all" ? t("market") : `${t("market")}: ${option?.label}`
          }
          triggerClassName="min-h-7 rounded-full px-2.5 text-[11.5px] font-semibold"
          value={market}
        />
        <MenuSelect
          ariaLabel={t("device")}
          compact
          onChange={onDeviceChange}
          options={options(devices, t("allDevices"))}
          selectedContent={(option) =>
            option?.value === "all" ? t("device") : `${t("device")}: ${option?.label}`
          }
          triggerClassName="min-h-7 rounded-full px-2.5 text-[11.5px] font-semibold"
          value={device}
        />
      </div>
      {activeFilters ? (
        <p className="m-0 text-[11.5px] leading-5 text-fg-muted">
          {t("drawer.matches", { count: matchingCount })}
        </p>
      ) : null}
    </div>
  );
}
