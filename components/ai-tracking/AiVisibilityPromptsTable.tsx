"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tooltip } from "@/components/ui/Tooltip";
import { useLiveNow } from "@/components/ui/useLiveNow";
import type { PromptOutcomeRow, PromptTableRow } from "@/lib/ai-tracking/prompts-model";
import { groupPromptRows } from "@/lib/ai-tracking/prompts-projection";
import { useFormatter, useTranslations } from "next-intl";
import { aiVisibilityTableLayouts } from "./ai-visibility-column-layout";
import { overviewEngineCopy, overviewEngineLabel } from "./overview-labels";

export function AiVisibilityPromptsTable({
  canWrite,
  now,
  onSelect,
  onSelectionChange,
  rows,
  selectedId,
  selection,
}: Readonly<{
  canWrite: boolean;
  now: string;
  onSelect: (id: string) => void;
  onSelectionChange: (next: ReadonlySet<string>) => void;
  rows: readonly PromptOutcomeRow[];
  selectedId: string | null;
  selection: ReadonlySet<string>;
}>) {
  const t = useTranslations("projectAiTracking");
  const format = useFormatter();
  const labels = overviewEngineCopy((key) => t(key));
  const layout = aiVisibilityTableLayouts.prompts;
  const clock = useLiveNow(now, false);
  const grouped = groupPromptRows(rows);
  const columns: DataTableColumn<PromptTableRow>[] = [
    {
      cell: ({ row }) => {
        if (row.original.kind !== "row") return null;
        const prompt = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip content={prompt.text} wrapperClassName="min-w-0 max-w-full">
              <span className="block truncate text-sm">{prompt.text}</span>
            </Tooltip>
            {prompt.status === "paused" ? (
              <StatusChip label={t("promptsTab.statusPaused")} size="sm" tone="attention" />
            ) : null}
            {prompt.status === "archived" ? (
              <StatusChip label={t("promptsTab.statusArchived")} size="sm" tone="neutral" />
            ) : null}
          </div>
        );
      },
      header: t("promptsTab.columnPrompt"),
      id: "prompt",
      meta: { flex: layout.prompt.flex, lockVisible: true },
      minSize: layout.prompt.minSize,
      size: layout.prompt.size,
    },
    {
      cell: ({ row }) =>
        row.original.kind === "row"
          ? t(
              row.original.type === "branded"
                ? "overview.promptBranded"
                : "overview.promptUnbranded",
            )
          : null,
      header: t("promptsTab.columnType"),
      id: "type",
      size: layout.type.size,
    },
    {
      cell: ({ row }) => {
        if (row.original.kind !== "row") return null;
        if (!row.original.engines.length) return t("overview.unknownCount");
        return (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {row.original.engines.map((engine) => (
              <span className="whitespace-nowrap" data-engine={engine} key={engine}>
                {overviewEngineLabel(engine, labels)}
              </span>
            ))}
          </div>
        );
      },
      header: t("promptsTab.columnEngines"),
      id: "engines",
      size: layout.engines.size,
    },
    {
      cell: ({ row }) =>
        row.original.kind === "row"
          ? t("overview.countOf", { count: row.original.named, total: row.original.total })
          : null,
      header: t("promptsTab.columnNamed"),
      id: "named",
      size: layout.named.size,
    },
    {
      cell: ({ row }) =>
        row.original.kind === "row"
          ? t("overview.countOf", { count: row.original.cited, total: row.original.total })
          : null,
      header: t("promptsTab.columnCited"),
      id: "cited",
      size: layout.cited.size,
    },
    {
      cell: ({ row }) => {
        if (row.original.kind !== "row") return null;
        if (!row.original.leader) return t("overview.unknownCount");
        return row.original.leader.own ? t("overview.you") : row.original.leader.label;
      },
      header: t("promptsTab.columnLeader"),
      id: "leader",
      size: layout.leader.size,
    },
    {
      cell: ({ row }) => {
        if (row.original.kind !== "row") return null;
        if (!row.original.lastRunAt) return t("overview.unknownCount");
        const date = new Date(row.original.lastRunAt);
        return Number.isFinite(date.getTime())
          ? format.relativeTime(date, new Date(clock))
          : t("overview.unknownCount");
      },
      header: t("promptsTab.columnLastRun"),
      id: "lastRun",
      meta: { lockVisible: true },
      size: layout.lastRun.size,
    },
  ];
  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-border">
      <DataTable
        ariaLabel={t("prompts")}
        bordered={false}
        columns={columns}
        density="compact"
        emptyState={<p className="px-3 py-6 text-sm text-fg-muted">{t("promptsTab.emptyTable")}</p>}
        id="ai-visibility-prompts"
        onRowClick={(row) => {
          if (row.kind === "row") onSelect(row.id);
        }}
        onSelectionChange={canWrite ? onSelectionChange : undefined}
        onSortingChange={() => undefined}
        renderSection={(row) =>
          row.kind === "section"
            ? t("promptsTab.group", {
                count: row.count,
                topic: row.topicName ?? t("promptsTab.noTopic"),
              })
            : null
        }
        rowClassName={(row) =>
          row.kind === "row" && row.id === selectedId ? "bg-accent-soft!" : ""
        }
        rows={grouped}
        selectable={(row) => row.kind === "row" && canWrite && row.status !== "archived"}
        selection={canWrite ? selection : undefined}
        sorting={null}
      />
    </div>
  );
}
