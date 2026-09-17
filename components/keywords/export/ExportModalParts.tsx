import { BracketsCurlyIcon as BracketsCurly } from "@phosphor-icons/react/dist/csr/BracketsCurly";
import { ChartLineIcon as ChartLine } from "@phosphor-icons/react/dist/csr/ChartLine";
import { FileCsvIcon as FileCsv } from "@phosphor-icons/react/dist/csr/FileCsv";
import { FileXlsIcon as FileXls } from "@phosphor-icons/react/dist/csr/FileXls";
import { TargetIcon as Target } from "@phosphor-icons/react/dist/csr/Target";
import { useTranslations } from "next-intl";
import type { ComponentType, ReactNode } from "react";

export const exportFormats = ["csv", "xlsx", "json"] as const;
export const exportScopes = ["current", "history"] as const;
export const exportColumns = [
  "url",
  "tags",
  "topic",
  "intent",
  "country",
  "device",
  "change",
] as const;

export type ExportFormat = (typeof exportFormats)[number];
export type ExportScope = (typeof exportScopes)[number];
export type ExportColumn = (typeof exportColumns)[number];

export const exportFormatIcons: Record<
  ExportFormat,
  ComponentType<{ size?: number; weight?: "fill" | "regular" }>
> = {
  csv: FileCsv,
  json: BracketsCurly,
  xlsx: FileXls,
};

export const exportScopeIcons: Record<
  ExportScope,
  ComponentType<{ className?: string; size?: number; weight?: "regular" }>
> = {
  current: Target,
  history: ChartLine,
};

export function useExportModalPresentation() {
  const t = useTranslations("projectRankTracker.keywordImport.management.export");
  return {
    columnLabels: {
      change: t("columnChange"),
      country: t("columnCountry"),
      device: t("columnDevice"),
      intent: t("columnIntent"),
      tags: t("columnTags"),
      topic: t("columnTopic"),
      url: t("columnUrl"),
    } as const,
    formatOptions: [
      {
        desc: t("formatCsvDescription"),
        ext: ".csv",
        icon: exportFormatIcons.csv,
        id: "csv" as const,
        name: "CSV",
        tint: "green",
      },
      {
        desc: t("formatExcelDescription"),
        ext: ".xlsx",
        icon: exportFormatIcons.xlsx,
        id: "xlsx" as const,
        name: "Excel",
        tint: "green",
      },
      {
        desc: t("formatJsonDescription"),
        ext: ".json",
        icon: exportFormatIcons.json,
        id: "json" as const,
        name: "JSON",
        tint: "blue",
      },
    ],
    granularityOptions: [
      { label: t("daily"), value: "daily" },
      { label: t("weekly"), value: "weekly" },
    ] as const,
    rangeOptions: [
      { label: t("last30Days"), value: "30" },
      { label: t("last90Days"), value: "90" },
      { label: t("allHistory"), value: "all" },
    ] as const,
    scopeOptions: [
      {
        desc: t("currentPositionsDescription"),
        icon: exportScopeIcons.current,
        id: "current" as const,
        name: t("currentPositions"),
      },
      {
        desc: t("rankingHistoryDescription"),
        icon: exportScopeIcons.history,
        id: "history" as const,
        name: t("rankingHistory"),
      },
    ],
    t,
  };
}

export function ExportOptionRow({
  active,
  children,
  onClick,
}: Readonly<{
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}>) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-control border-[1.5px] px-[13px] py-[11px] text-left outline-none transition-colors hover:border-accent focus-visible:border-accent"
      onClick={onClick}
      style={{
        backgroundColor: active ? "var(--accent-soft)" : "var(--bg-elev)",
        borderColor: active ? "var(--accent)" : "var(--border)",
      }}
      type="button"
    >
      {children}
      <span
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px]"
        style={{ borderColor: active ? "var(--accent)" : "var(--border)" }}
      >
        {active ? <span className="h-[9px] w-[9px] rounded-full bg-accent" /> : null}
      </span>
    </button>
  );
}
