"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip } from "@/components/ui/StatusChip";
import { ValueBar } from "@/components/ui/ValueBar";
import type { SourceOverrideType } from "@/lib/ai-tracking/source-types";
import type { AiSourceRow } from "@/lib/ai-tracking/sources-model";
import { useTranslations } from "next-intl";
import { AiVisibilitySourceActions } from "./AiVisibilitySourceActions";
import { aiVisibilityTableLayouts } from "./ai-visibility-column-layout";
import { sourceTypeLabel } from "./source-copy";

export function AiVisibilitySourcesTable({
  canWrite,
  group,
  onAdd,
  onClearType,
  onRemove,
  onSetType,
  pending,
  rows,
  totalAnswers,
}: Readonly<{
  canWrite: boolean;
  group: "domains" | "pages";
  onAdd: (domain: string, url: string | null) => void;
  onClearType: (domain: string) => void;
  onRemove: (domain: string) => void;
  onSetType: (domain: string, type: SourceOverrideType) => void;
  pending: boolean;
  rows: readonly AiSourceRow[];
  totalAnswers: number;
}>) {
  const t = useTranslations("projectAiTracking");
  const layout = aiVisibilityTableLayouts.sources;
  const widest = Math.max(1, ...rows.map((row) => row.links));
  const columns: DataTableColumn<AiSourceRow>[] = [
    {
      cell: ({ row }) =>
        row.original.url ? (
          <div className="min-w-0 py-1">
            <span className="block truncate text-sm">{row.original.url}</span>
            <span className="block truncate text-ui-caption text-fg-muted">
              {row.original.domain}
            </span>
          </div>
        ) : (
          <span className="block truncate text-sm">{row.original.domain}</span>
        ),
      header: group === "pages" ? t("sources.columnPage") : t("sources.columnDomain"),
      id: "domain",
      meta: { flex: layout.domain.flex, lockVisible: true },
      minSize: layout.domain.minSize,
      size: layout.domain.size,
    },
    {
      cell: ({ row }) => (
        <StatusChip label={sourceTypeLabel(row.original.type, t)} size="sm" tone="neutral" />
      ),
      header: t("sources.columnType"),
      id: "type",
      size: layout.type.size,
    },
    {
      cell: ({ row }) =>
        t("sources.answersOf", { count: row.original.answers, total: totalAnswers }),
      header: t("sources.columnAnswers"),
      id: "answers",
      size: layout.answers.size,
    },
    {
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <ValueBar className="w-16" max={widest} tone="positive" value={row.original.links} />
          <span className="tabular-nums text-ui-caption">{row.original.links}</span>
        </div>
      ),
      header: t("sources.columnLinks"),
      id: "links",
      size: layout.links.size,
    },
    {
      cell: ({ row }) => (
        <AiVisibilitySourceActions
          canWrite={canWrite}
          onAdd={onAdd}
          onClearType={onClearType}
          onRemove={onRemove}
          onSetType={onSetType}
          pending={pending}
          row={row.original}
        />
      ),
      header: "",
      id: "action",
      meta: { lockResize: layout.action.lockResize },
      minSize: layout.action.minSize,
      size: layout.action.size,
    },
  ];
  return (
    <DataTable
      ariaLabel={t("sources.tableLabel")}
      columns={columns}
      density="compact"
      emptyState={<p className="m-0 text-ui-body text-fg-muted">{t("sources.tableEmpty")}</p>}
      id="ai-visibility-sources"
      rows={[...rows]}
      sorting={null}
      onSortingChange={() => undefined}
    />
  );
}
