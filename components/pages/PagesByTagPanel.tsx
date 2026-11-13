"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Modal } from "@/components/ui/Modal";
import { TagChip } from "@/components/ui/TagChip";
import type { ActivePageSnapshot } from "@/lib/pages/snapshot-view";
import type { PagesByTagRow, ProjectPageTagOption, ProjectPageTagView } from "@/lib/pages/tag-view";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PagesSnapshotBanner } from "./PagesSnapshotBanner";

type ByTagTableRow = PagesByTagRow & { id: string };

/** 4px table scale. Floor keeps the nowrap Edit rule control on one line at 1280. */
export const byTagActionsMinSize = 240;

function signedCount(format: ReturnType<typeof useFormatter>, value: number, sign: "+" | "-") {
  if (value === 0) return "0";
  return `${sign}${format.number(value)}`;
}

function ruleLabel(row: PagesByTagRow, t: ReturnType<typeof useTranslations<"projectPages">>) {
  const kind = row.rule?.kind ?? "manual";
  if (kind === "path_pattern" && row.rule?.pattern) return row.rule.pattern;
  if (kind === "url_list") return t("byTag.ruleUrls", { count: row.rule?.urls.length ?? 0 });
  if (kind === "sitemap") return row.rule?.sitemapUrl || t("byTag.kind.sitemap");
  return t("byTag.ruleHand");
}

export function PagesByTagPanel({
  canCreate,
  canDelete,
  canWrite,
  onAddToPages,
  onEdit,
  onNew,
  onOpen,
  onRemove,
  projectId,
  snapshot = null,
  view,
}: Readonly<{
  canCreate: boolean;
  canDelete: boolean;
  canWrite: boolean;
  onAddToPages: (tag: ProjectPageTagOption) => void;
  onEdit: (row: PagesByTagRow) => void;
  onNew: () => void;
  onOpen: (tagId: string) => void;
  onRemove: (tagId: string) => Promise<void>;
  projectId: string;
  snapshot?: ActivePageSnapshot | null;
  view: ProjectPageTagView;
}>) {
  const t = useTranslations("projectPages");
  const format = useFormatter();
  const [showKeywordOnly, setShowKeywordOnly] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<PagesByTagRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const rows = useMemo<ByTagTableRow[]>(
    () => view.rows.map((row) => ({ ...row, id: row.tagId })),
    [view.rows],
  );
  const names = view.keywordOnly.map((tag) => tag.name).join(", ");
  const columns = useMemo<readonly DataTableColumn<ByTagTableRow>[]>(
    () => [
      {
        cell: ({ row }) => <TagChip label={row.original.name} />,
        header: t("byTag.columns.tag"),
        id: "tag",
        meta: { flex: 1, title: t("byTag.columns.tag") },
        minSize: 140,
        size: 180,
      },
      {
        cell: ({ row }) => <span className="truncate">{ruleLabel(row.original, t)}</span>,
        header: t("byTag.columns.rule"),
        id: "rule",
        meta: { flex: 1, title: t("byTag.columns.rule") },
        minSize: 140,
        size: 180,
      },
      {
        cell: ({ row }) => t(`byTag.kind.${row.original.rule?.kind ?? "manual"}`),
        header: t("byTag.columns.type"),
        id: "type",
        meta: { title: t("byTag.columns.type") },
        size: 140,
      },
      {
        cell: ({ row }) => format.number(row.original.pages),
        header: t("byTag.columns.pages"),
        id: "pages",
        meta: { align: "end", title: t("byTag.columns.pages") },
        size: 96,
      },
      ...(snapshot
        ? [
            {
              cell: ({ row }: { row: { original: ByTagTableRow } }) =>
                format.number(row.original.existingPages),
              header: t("byTag.columns.existing"),
              id: "existing",
              meta: { align: "end" as const, title: t("byTag.columns.existing") },
              size: 110,
            },
            {
              cell: ({ row }: { row: { original: ByTagTableRow } }) =>
                signedCount(format, row.original.newPages, "+"),
              header: t("byTag.columns.new"),
              id: "new",
              meta: { align: "end" as const, title: t("byTag.columns.new") },
              size: 96,
            },
            {
              cell: ({ row }: { row: { original: ByTagTableRow } }) =>
                signedCount(format, row.original.removedPages, "-"),
              header: t("byTag.columns.removed"),
              id: "removed",
              meta: { align: "end" as const, title: t("byTag.columns.removed") },
              size: 110,
            },
          ]
        : []),
      {
        cell: ({ row }) => format.number(row.original.keywords),
        header: t("byTag.columns.keywords"),
        id: "keywords",
        meta: { align: "end", title: t("byTag.columns.keywords") },
        size: 110,
      },
      {
        cell: ({ row }) => (
          <span className="flex flex-nowrap gap-1">
            <Button
              className="whitespace-nowrap"
              disabled={!canWrite}
              onClick={(event) => {
                event.stopPropagation();
                onEdit(row.original);
              }}
              size="xs"
              type="button"
              variant="secondary"
            >
              {t("byTag.edit")}
            </Button>
            {canDelete ? (
              <Button
                className="whitespace-nowrap"
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingRemove(row.original);
                }}
                size="xs"
                type="button"
                variant="secondary"
              >
                {t("byTag.remove")}
              </Button>
            ) : null}
          </span>
        ),
        header: t("byTag.columns.actions"),
        id: "actions",
        maxSize: byTagActionsMinSize,
        meta: { lockResize: true, title: t("byTag.columns.actions") },
        minSize: byTagActionsMinSize,
        size: byTagActionsMinSize,
      },
    ],
    [canDelete, canWrite, format, onEdit, snapshot, t],
  );

  return (
    <div className="flex flex-col gap-3">
      {snapshot ? <PagesSnapshotBanner projectId={projectId} snapshot={snapshot} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-ui-caption text-fg-muted">{t("byTag.lead")}</p>
        <Button disabled={!canCreate} onClick={onNew} size="sm" type="button" variant="primary">
          {t("tags.new")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="m-0 text-ui-caption text-fg-muted">{t("byTag.empty")}</p>
      ) : (
        <DataTable
          ariaLabel={t("byTag.tableLabel")}
          columns={columns}
          density="compact"
          id="project-pages-by-tag"
          onRowClick={(row) => onOpen(row.tagId)}
          onSortingChange={() => undefined}
          rows={rows}
          sorting={null}
          sortingMode="client"
        />
      )}
      {view.keywordOnly.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-ui-caption text-fg-muted">
            {t("byTag.keywordOnly", { count: view.keywordOnly.length, names })}{" "}
            <Button
              onClick={() => setShowKeywordOnly((current) => !current)}
              size="xs"
              type="button"
              variant="ghost"
            >
              {showKeywordOnly ? t("byTag.hide") : t("byTag.show")}
            </Button>
          </p>
          {showKeywordOnly ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {view.keywordOnly.map((tag) => (
                <li className="flex items-center gap-2" key={tag.id}>
                  <TagChip label={tag.name} />
                  <Button
                    disabled={!canWrite}
                    onClick={() => onAddToPages(tag)}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    {t("byTag.addToPages")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <Link
        className="text-ui-caption text-accent-text"
        href={appPath(projectId, "settings", "tags")}
      >
        {t("byTag.manage")}
      </Link>
      <Modal
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setPendingRemove(null)} type="button" variant="ghost">
              {t("byTag.cancel")}
            </Button>
            <Button
              disabled={removing}
              onClick={() => {
                if (!pendingRemove) return;
                setRemoving(true);
                void onRemove(pendingRemove.tagId).finally(() => {
                  setRemoving(false);
                  setPendingRemove(null);
                });
              }}
              type="button"
              variant="destructive"
            >
              {t("byTag.removeConfirm")}
            </Button>
          </div>
        }
        onClose={() => setPendingRemove(null)}
        open={pendingRemove !== null}
        title={pendingRemove ? t("byTag.removeTitle", { name: pendingRemove.name }) : ""}
      >
        <p className="m-0 text-ui-caption text-fg-muted">{t("byTag.removeBody")}</p>
      </Modal>
    </div>
  );
}
