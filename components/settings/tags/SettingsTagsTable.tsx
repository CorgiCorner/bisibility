"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { TagChip } from "@/components/ui/TagChip";
import { Tooltip } from "@/components/ui/Tooltip";
import type {
  SettingsTagRow,
  SettingsTagRuleLabel,
  SettingsTagUsageItem,
  SettingsTagUsageKind,
} from "@/lib/queries/tag-settings";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";

/** Row menu is 30px. Standard cells pad 12px each side (`px-3`), so the column holds the border. */
export const settingsTagsActionControlWidth = 30;
export const settingsTagsCellPadding = 12;

/** Widths that fit the 760px settings column, including the actions control. */
export const settingsTagsColumnSizes = {
  actions: 56,
  keywords: 88,
  pages: 72,
  rule: 120,
  tag: 140,
  used: 140,
} as const;

export const settingsTagsColumnBudget = 720;

export function settingsTagsColumnsFit(containerWidth = settingsTagsColumnBudget) {
  const sum = Object.values(settingsTagsColumnSizes).reduce((total, size) => total + size, 0);
  return { fits: sum <= containerWidth, sum };
}

function ruleText(
  label: SettingsTagRuleLabel,
  t: ReturnType<typeof useTranslations<"projectSettingsTags">>,
) {
  if (label.kind === "pattern") return label.pattern;
  if (label.kind === "urls") return t("rule.urls", { count: label.count });
  if (label.kind === "sitemap") return t("rule.sitemap");
  if (label.kind === "hand") return t("rule.hand");
  return t("rule.none");
}

function names(items: readonly SettingsTagUsageItem[], kind: SettingsTagUsageKind) {
  return items.filter((item) => item.kind === kind).map((item) => item.name);
}

function UsedIn({ items }: Readonly<{ items: readonly SettingsTagUsageItem[] }>) {
  const t = useTranslations("projectSettingsTags");
  const alerts = names(items, "alert");
  const views = names(items, "saved_view");
  const segments = names(items, "keyword_segment");
  if (alerts.length + views.length + segments.length === 0) {
    return <span className="text-fg-muted">{t("usage.none")}</span>;
  }
  const parts = [
    alerts.length > 0 ? t("usage.alert", { count: alerts.length }) : null,
    views.length > 0 ? t("usage.savedView", { count: views.length }) : null,
    segments.length > 0 ? t("usage.keywordSegment", { count: segments.length }) : null,
  ].filter((part): part is string => part !== null);
  const tooltip = [
    alerts.length > 0 ? t("usage.tooltipAlerts", { names: alerts.join(", ") }) : null,
    views.length > 0 ? t("usage.tooltipSavedViews", { names: views.join(", ") }) : null,
    segments.length > 0 ? t("usage.tooltipKeywordSegments", { names: segments.join(", ") }) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
  return (
    <Tooltip content={tooltip} semantics="description">
      <span>{parts.join(", ")}</span>
    </Tooltip>
  );
}

export function SettingsTagsTable({
  canDelete,
  canEdit,
  onDelete,
  onEdit,
  onMerge,
  onRename,
  rows,
}: Readonly<{
  canDelete: boolean;
  canEdit: boolean;
  onDelete: (row: SettingsTagRow) => void;
  onEdit: (row: SettingsTagRow) => void;
  onMerge: (row: SettingsTagRow) => void;
  onRename: (row: SettingsTagRow) => void;
  rows: readonly SettingsTagRow[];
}>) {
  const t = useTranslations("projectSettingsTags");
  const format = useFormatter();
  const columns = useMemo<readonly DataTableColumn<SettingsTagRow>[]>(
    () => [
      {
        cell: ({ row }) => <TagChip label={row.original.name} />,
        header: t("columns.tag"),
        id: "tag",
        meta: { flex: 1, title: t("columns.tag") },
        minSize: 100,
        size: settingsTagsColumnSizes.tag,
      },
      {
        cell: ({ row }) => format.number(row.original.pages),
        header: t("columns.pages"),
        id: "pages",
        meta: { align: "end", title: t("columns.pages") },
        size: settingsTagsColumnSizes.pages,
      },
      {
        cell: ({ row }) => format.number(row.original.keywords),
        header: t("columns.keywords"),
        id: "keywords",
        meta: { align: "end", title: t("columns.keywords") },
        size: settingsTagsColumnSizes.keywords,
      },
      {
        cell: ({ row }) => <span className="truncate">{ruleText(row.original.ruleLabel, t)}</span>,
        header: t("columns.rule"),
        id: "rule",
        meta: { flex: 1, title: t("columns.rule") },
        minSize: 96,
        size: settingsTagsColumnSizes.rule,
      },
      {
        cell: ({ row }) => <UsedIn items={row.original.usage} />,
        header: t("columns.usedIn"),
        id: "used",
        meta: { flex: 1, title: t("columns.usedIn") },
        minSize: 100,
        size: settingsTagsColumnSizes.used,
      },
      {
        cell: ({ row }) => (
          <RowActionsMenu
            ariaLabel={t("menu", { name: row.original.name })}
            items={[
              {
                disabled: !canEdit,
                label: t("menuEdit"),
                onSelect: () => onEdit(row.original),
              },
              {
                disabled: !canEdit,
                label: t("menuRename"),
                onSelect: () => onRename(row.original),
              },
              {
                disabled: !canDelete || rows.length < 2,
                label: t("menuMerge"),
                onSelect: () => onMerge(row.original),
              },
              {
                danger: true,
                disabled: !canDelete,
                label: t("menuDelete"),
                onSelect: () => onDelete(row.original),
              },
            ]}
          />
        ),
        header: () => <span className="sr-only">{t("columns.actions")}</span>,
        id: "actions",
        maxSize: settingsTagsColumnSizes.actions,
        meta: { lockResize: true, title: t("columns.actions") },
        minSize: settingsTagsColumnSizes.actions,
        size: settingsTagsColumnSizes.actions,
      },
    ],
    [canDelete, canEdit, format, onDelete, onEdit, onMerge, onRename, rows.length, t],
  );
  return (
    <DataTable
      ariaLabel={t("tableLabel")}
      columns={columns}
      density="compact"
      emptyState={<p className="px-3 py-6 text-ui-caption text-fg-muted">{t("empty")}</p>}
      id="settings-tags"
      onSortingChange={() => undefined}
      rows={rows}
      sorting={null}
      sortingMode="client"
    />
  );
}
