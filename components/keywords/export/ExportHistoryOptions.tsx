"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { useTranslations } from "next-intl";
import type { ExportHistoryValues } from "./export-history-request";

const triggerClassName =
  "min-h-9 flex-1 justify-between rounded-control border-border-control bg-bg-elev px-3 text-[12.5px] font-normal";

export function ExportHistoryOptions({
  values,
  onRangeChange,
  onGranularityChange,
  onVersionChange,
  onStreamChange,
}: Readonly<{
  values: ExportHistoryValues;
  onRangeChange: (value: ExportHistoryValues["range"]) => void;
  onGranularityChange: (value: ExportHistoryValues["granularity"]) => void;
  onVersionChange: (value: ExportHistoryValues["historyVersion"]) => void;
  onStreamChange: (value: ExportHistoryValues["stream"]) => void;
}>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.export");
  const report = values.historyVersion === "2";
  return (
    <div className="mt-2 grid gap-2">
      <MenuSelect
        ariaLabel={t("historyFormatAria")}
        value={values.historyVersion}
        onChange={(value) => {
          if (value === "1" || value === "2") onVersionChange(value);
        }}
        options={[
          { label: t("legacyHistory"), value: "1" },
          { label: t("evidenceReport"), value: "2" },
        ]}
        triggerClassName={triggerClassName}
      />
      <p className="m-0 text-[11.5px] leading-[1.45] text-fg-muted">
        {t(report ? "evidenceReportDescription" : "legacyHistoryDescription")}
      </p>
      <div className="flex flex-wrap gap-2">
        <MenuSelect
          ariaLabel={t("rangeAria")}
          value={values.range}
          onChange={(value) => {
            if (value === "30" || value === "90" || value === "all") onRangeChange(value);
          }}
          options={[
            { label: t("last30Days"), value: "30" },
            { label: t("last90Days"), value: "90" },
            { label: t("allHistory"), value: "all" },
          ]}
          triggerClassName={triggerClassName}
        />
        {report ? (
          <MenuSelect
            ariaLabel={t("reportStreamAria")}
            value={values.stream}
            onChange={(value) => {
              if (value === "observations" || value === "attempts") onStreamChange(value);
            }}
            options={[
              { label: t("reportObservations"), value: "observations" },
              { label: t("reportAttempts"), value: "attempts" },
            ]}
            triggerClassName={triggerClassName}
          />
        ) : (
          <MenuSelect
            ariaLabel={t("granularityAria")}
            value={values.granularity}
            onChange={(value) => {
              if (value === "daily" || value === "weekly") onGranularityChange(value);
            }}
            options={[
              { label: t("daily"), value: "daily" },
              { label: t("weekly"), value: "weekly" },
            ]}
            triggerClassName={triggerClassName}
          />
        )}
      </div>
    </div>
  );
}
