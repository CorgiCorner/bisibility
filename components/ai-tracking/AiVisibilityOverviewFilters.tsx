"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import type { OverviewFilters, OverviewMarketOption } from "@/lib/ai-tracking/overview-model";
import {
  marketKey,
  overviewEngine,
  overviewPeriod,
  overviewPromptKind,
  overviewTopic,
  parseMarketKey,
} from "@/lib/ai-tracking/overview-model";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { useTranslations } from "next-intl";
import { overviewEngineCopy, overviewEngineLabel } from "./overview-labels";

const periods = ["7d", "30d", "90d", "all"] as const;

export function AiVisibilityOverviewFilters({
  engines,
  filters,
  markets,
  onFilter,
  topics,
}: Readonly<{
  engines: readonly string[];
  filters: OverviewFilters;
  markets: readonly OverviewMarketOption[];
  onFilter: (filters: OverviewFilters) => void;
  topics: readonly { id: string; name: string }[];
}>) {
  const t = useTranslations("projectAiTracking");
  const enginesLabels = overviewEngineCopy((key) => t(key));
  const periodLabel = {
    "30d": t("overview.period30"),
    "7d": t("overview.period7"),
    "90d": t("overview.period90"),
    all: t("overview.periodAll"),
  } as const;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MenuSelect
        ariaLabel={t("overview.period")}
        leadingIcon={<CalendarBlank aria-hidden size={16} weight="regular" />}
        onChange={(value) => onFilter({ ...filters, period: overviewPeriod(value) })}
        options={periods.map((period) => ({ label: periodLabel[period], value: period }))}
        size="toolbar"
        value={filters.period}
      />
      {engines.length > 0 ? (
        <MenuSelect
          ariaLabel={t("overview.allEngines")}
          onChange={(value) =>
            onFilter({ ...filters, engine: value === "all" ? null : overviewEngine(value) })
          }
          options={[
            { label: t("overview.allEngines"), value: "all" },
            ...engines.map((engine) => ({
              label: overviewEngineLabel(engine, enginesLabels),
              value: engine,
            })),
          ]}
          size="toolbar"
          value={filters.engine ?? "all"}
        />
      ) : null}
      {topics.length > 0 ? (
        <MenuSelect
          ariaLabel={t("allTopics")}
          onChange={(value) =>
            onFilter({ ...filters, topic: value === "all" ? null : overviewTopic(value) })
          }
          options={[
            { label: t("allTopics"), value: "all" },
            ...topics.map((topic) => ({ label: topic.name, value: topic.id })),
          ]}
          size="toolbar"
          value={filters.topic ?? "all"}
        />
      ) : null}
      {markets.length > 0 ? (
        <MenuSelect
          ariaLabel={t("overview.allMarkets")}
          onChange={(value) =>
            onFilter({ ...filters, market: value === "all" ? null : parseMarketKey(value) })
          }
          options={[
            { label: t("overview.allMarkets"), value: "all" },
            ...markets.map((market) => ({ label: market.label, value: market.key })),
          ]}
          size="toolbar"
          value={filters.market ? marketKey(filters.market) : "all"}
        />
      ) : null}
      <MenuSelect
        ariaLabel={t("overview.promptAll")}
        onChange={(value) => onFilter({ ...filters, promptKind: overviewPromptKind(value) })}
        options={[
          { label: t("overview.promptAll"), value: "all" },
          { label: t("overview.promptBranded"), value: "branded" },
          { label: t("overview.promptUnbranded"), value: "unbranded" },
        ]}
        size="toolbar"
        value={filters.promptKind}
      />
    </div>
  );
}
