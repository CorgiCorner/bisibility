"use client";

import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { ActivePageSnapshot } from "@/lib/pages/snapshot-view";
import type { ProjectPageTagOption } from "@/lib/pages/tag-view";
import type { ProjectPageColumnSource, ProjectPagesListResult } from "@/lib/pages/types";
import type { ProjectPagesQuery } from "@/lib/pages/url-state";
import { useTranslations } from "next-intl";
import { ProjectPagesEmpty } from "./ProjectPagesEmpty";
import { ProjectPagesSources } from "./ProjectPagesSources";
import { ProjectPagesTable } from "./ProjectPagesTable";
import { ProjectPagesToolbar } from "./ProjectPagesToolbar";
import type { ProjectPagesTableRow } from "./project-pages-columns";

export function ProjectPagesAllPanel({
  canCreate,
  canEdit,
  canWrite,
  columns,
  list,
  narrowed,
  onCheckVitals,
  onFilters,
  onNewTag,
  onPaste,
  onQuery,
  onRefresh,
  onSearchChange,
  onSetTags,
  pending,
  projectId,
  query,
  search,
  snapshot,
  sources,
  tags,
}: Readonly<{
  canCreate: boolean;
  canEdit: boolean;
  canWrite: boolean;
  columns: readonly DataTableColumn<ProjectPagesTableRow>[];
  list: ProjectPagesListResult;
  narrowed: boolean;
  onCheckVitals: (paths: string[]) => Promise<void>;
  onFilters: () => void;
  onNewTag: () => void;
  onPaste: () => void;
  onQuery: (query: ProjectPagesQuery) => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onSetTags: (input: { add: string[]; remove: string[]; tagId: string }) => Promise<void>;
  pending: boolean;
  projectId: string;
  query: ProjectPagesQuery;
  search: string;
  snapshot: ActivePageSnapshot | null;
  sources: readonly ProjectPageColumnSource[];
  tags: readonly ProjectPageTagOption[];
}>) {
  const t = useTranslations("projectPages");
  return (
    <>
      <ProjectPagesToolbar
        canWrite={canCreate}
        columns={columns}
        counts={list.counts}
        onFilters={onFilters}
        onNewTag={onNewTag}
        onQuery={onQuery}
        onSearchChange={onSearchChange}
        pending={pending}
        query={query}
        search={search}
        showStatus={snapshot !== null}
        tags={tags}
      />
      <ProjectPagesSources
        canWrite={canWrite}
        conversion={list.conversions}
        onConversion={(source) => onQuery({ ...query, conv: source })}
        onPaste={onPaste}
        onRefresh={onRefresh}
        pending={pending}
        projectId={projectId}
        sources={sources}
      />
      {list.counts.all === 0 && !narrowed ? (
        <ProjectPagesEmpty
          canWrite={canWrite}
          onRefresh={onRefresh}
          pending={pending}
          sources={sources}
        />
      ) : (
        <ProjectPagesTable
          canWrite={canEdit}
          columns={columns}
          onCheckVitals={onCheckVitals}
          empty={t("empty.filtered")}
          key={`${query.page}:${query.tag ?? ""}:${query.search}`}
          list={list}
          onQuery={onQuery}
          onSetTags={onSetTags}
          pending={pending}
          query={query}
          tags={tags}
        />
      )}
    </>
  );
}
