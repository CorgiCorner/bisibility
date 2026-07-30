import {
  BracketsCurlyIcon as BracketsCurly,
  ChartLineIcon as ChartLine,
  FileCsvIcon as FileCsv,
  FileXlsIcon as FileXls,
  TargetIcon as Target,
} from "@phosphor-icons/react";
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

export const formatOptions: {
  desc: string;
  ext: string;
  icon: ComponentType<{ size?: number; weight?: "fill" | "regular" }>;
  id: ExportFormat;
  name: string;
  tint: string;
}[] = [
  {
    desc: "Universal, re-imports anywhere",
    ext: ".csv",
    icon: FileCsv,
    id: "csv",
    name: "CSV",
    tint: "green",
  },
  {
    desc: "Formatted workbook with headers",
    ext: ".xlsx",
    icon: FileXls,
    id: "xlsx",
    name: "Excel",
    tint: "green",
  },
  {
    desc: "Structured data with ranking history",
    ext: ".json",
    icon: BracketsCurly,
    id: "json",
    name: "JSON",
    tint: "blue",
  },
];

export const scopeOptions: {
  desc: string;
  icon: ComponentType<{ className?: string; size?: number; weight?: "bold" }>;
  id: ExportScope;
  name: string;
}[] = [
  {
    desc: "One row per keyword, latest rank",
    icon: Target,
    id: "current",
    name: "Current positions",
  },
  {
    desc: "Position over time, one row per day",
    icon: ChartLine,
    id: "history",
    name: "Ranking history",
  },
];

export const columnLabels: Record<ExportColumn, string> = {
  change: "Change",
  country: "Country",
  device: "Device",
  intent: "Intent",
  tags: "Tags",
  topic: "Topic",
  url: "Target URL",
};

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
      className="flex w-full items-center gap-3 rounded-[11px] border-[1.5px] px-[13px] py-[11px] text-left outline-none transition-colors hover:border-accent focus-visible:border-accent"
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
        style={{ borderColor: active ? "var(--accent)" : "var(--border-strong)" }}
      >
        {active ? <span className="h-[9px] w-[9px] rounded-full bg-accent" /> : null}
      </span>
    </button>
  );
}
