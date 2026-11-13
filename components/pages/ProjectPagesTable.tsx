"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import {
  FloatingSelectionBar,
  FloatingSelectionBarSpacer,
} from "@/components/ui/FloatingSelectionBar";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { ProjectPageTagOption } from "@/lib/pages/tag-view";
import { type ProjectPagesListResult, projectPageSortKeys } from "@/lib/pages/types";
import { PROJECT_PAGES_PAGE_SIZE, type ProjectPagesQuery } from "@/lib/pages/url-state";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ProjectPagesTableRow } from "./project-pages-columns";

export function ProjectPagesTable({
  canWrite,
  columns,
  empty,
  onCheckVitals,
  list,
  onQuery,
  onSetTags,
  pending,
  query,
  tags,
}: Readonly<{
  canWrite: boolean;
  columns: readonly DataTableColumn<ProjectPagesTableRow>[];
  empty: string;
  onCheckVitals: (paths: string[]) => Promise<void>;
  list: ProjectPagesListResult;
  onQuery: (query: ProjectPagesQuery) => void;
  onSetTags: (input: { add: string[]; remove: string[]; tagId: string }) => Promise<void>;
  pending: boolean;
  query: ProjectPagesQuery;
  tags: readonly ProjectPageTagOption[];
}>) {
  const t = useTranslations("projectPages");
  const rows: ProjectPagesTableRow[] = list.rows.map((row) => ({ ...row, id: row.path }));
  const sorting: DataTableSort = { direction: query.dir, field: query.sort };
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [bulkTag, setBulkTag] = useState(query.tag ?? tags[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const selected = [...selection];

  async function checkVitals() {
    if (!canWrite || selected.length === 0 || busy) return;
    setBusy(true);
    try {
      await onCheckVitals(selected.slice(0, 25));
      setSelection(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function apply(mode: "add" | "remove") {
    if (!canWrite || !bulkTag || selected.length === 0 || busy) return;
    setBusy(true);
    try {
      await onSetTags({
        add: mode === "add" ? selected : [],
        remove: mode === "remove" ? selected : [],
        tagId: bulkTag,
      });
      setSelection(new Set());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <DataTable
        ariaLabel={t("tableLabel")}
        columns={columns}
        density="compact"
        emptyState={<p className="px-3 py-6 text-ui-caption text-fg-muted">{empty}</p>}
        id="project-pages"
        onPaginationChange={(next) => onQuery({ ...query, page: next.page })}
        onSelectionChange={canWrite ? setSelection : undefined}
        selectable={canWrite ? undefined : () => false}
        onSortingChange={(next) => {
          const sort = projectPageSortKeys.find((key) => key === next?.field) ?? "clicks";
          onQuery({
            ...query,
            dir: next?.direction ?? "desc",
            page: 1,
            sort,
          });
        }}
        pagination={{
          page: query.page,
          pageSize: PROJECT_PAGES_PAGE_SIZE,
          pageSizeOptions: [PROJECT_PAGES_PAGE_SIZE],
          rowCount: list.total,
        }}
        paginationMode="server"
        pending={pending}
        rows={rows}
        selection={canWrite ? selection : undefined}
        sorting={sorting}
        sortingMode="server"
      />
      {selected.length > 0 ? (
        <>
          <FloatingSelectionBar
            ariaLabel={t("bulk.selected", { count: selected.length })}
            clearLabel={t("bulk.clear")}
            count={selected.length}
            countLabel={t("bulk.selected", { count: selected.length })}
            onClear={() => setSelection(new Set())}
          >
            {tags.length > 0 ? (
              <MenuSelect
                ariaLabel={t("bulk.choose")}
                onChange={setBulkTag}
                options={tags.map((tag) => ({ label: tag.name, value: tag.id }))}
                value={bulkTag}
              />
            ) : null}
            <Button
              disabled={busy}
              onClick={() => void checkVitals()}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("bulk.check")}
            </Button>
            <Button
              disabled={busy || !bulkTag}
              onClick={() => void apply("add")}
              size="sm"
              type="button"
            >
              {t("bulk.add")}
            </Button>
            <Button
              disabled={busy || !bulkTag}
              onClick={() => void apply("remove")}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("bulk.remove")}
            </Button>
          </FloatingSelectionBar>
          <FloatingSelectionBarSpacer />
        </>
      ) : null}
    </div>
  );
}
