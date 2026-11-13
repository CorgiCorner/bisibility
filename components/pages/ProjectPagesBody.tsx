"use client";

import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { CompareView } from "@/lib/pages/compare-model";
import type {
  ActivePageSnapshot,
  ExistingVsNewView,
  TakePageSnapshotResult,
} from "@/lib/pages/snapshot-view";
import type { ProjectPageTagView } from "@/lib/pages/tag-view";
import type { ProjectPageColumnSource, ProjectPagesListResult } from "@/lib/pages/types";
import type { ProjectPagesQuery } from "@/lib/pages/url-state";
import type { PageTagFormValues } from "@/lib/schemas/page-tag";
import { useTranslations } from "next-intl";
import { PagesByTagPanel } from "./PagesByTagPanel";
import { PagesComparePanel } from "./PagesComparePanel";
import { PagesExistingPanel } from "./PagesExistingPanel";
import { ProjectPagesAllPanel } from "./ProjectPagesAllPanel";
import { pageTagFormForRow, pageTagFormForTag } from "./page-tag-form";
import type { ProjectPagesTableRow } from "./project-pages-columns";

type DrawerState = {
  form: PageTagFormValues;
  tagId?: string;
  title: string;
};

export function ProjectPagesBody({
  canCreate,
  canDelete,
  canEdit,
  canWrite,
  columns,
  compare,
  comparison,
  list,
  narrowed,
  onCheckVitals,
  onLoad,
  onRefresh,
  onRemoveTag,
  onSearchChange,
  onSetTags,
  onSnapshot,
  pending,
  projectId,
  query,
  search,
  setDrawer,
  setFiltersOpen,
  setPasteOpen,
  snapshot,
  sources,
  tags,
  takeSnapshot,
}: Readonly<{
  canCreate: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canWrite: boolean;
  columns: readonly DataTableColumn<ProjectPagesTableRow>[];
  compare: CompareView | null;
  comparison: ExistingVsNewView | null;
  list: ProjectPagesListResult;
  narrowed: boolean;
  onCheckVitals: (paths: string[]) => Promise<void>;
  onLoad: (query: ProjectPagesQuery) => void;
  onRefresh: () => void;
  onRemoveTag: (tagId: string) => Promise<void>;
  onSearchChange: (value: string) => void;
  onSetTags: (input: { add: string[]; remove: string[]; tagId: string }) => Promise<void>;
  onSnapshot: (snapshot: ActivePageSnapshot) => void;
  pending: boolean;
  projectId: string;
  query: ProjectPagesQuery;
  search: string;
  setDrawer: (drawer: DrawerState | null) => void;
  setFiltersOpen: (open: boolean) => void;
  setPasteOpen: (open: boolean) => void;
  snapshot: ActivePageSnapshot | null;
  sources: readonly ProjectPageColumnSource[];
  tags: ProjectPageTagView;
  takeSnapshot: (input: {
    confirm?: boolean;
    projectId: string;
  }) => Promise<TakePageSnapshotResult>;
}>) {
  const t = useTranslations("projectPages");
  const edit = (tag: { name: string }, tagId?: string): DrawerState => ({
    form: pageTagFormForTag(tag),
    tagId,
    title: tag.name ? t("drawer.titleEdit", { name: tag.name }) : t("drawer.titleNew"),
  });
  if (query.tab === "by-tag") {
    return (
      <PagesByTagPanel
        canCreate={canCreate}
        canDelete={canDelete}
        canWrite={canEdit}
        onAddToPages={(tag) => setDrawer(edit(tag, tag.id))}
        onEdit={(row) =>
          setDrawer({
            form: pageTagFormForRow(row),
            tagId: row.tagId,
            title: t("drawer.titleEdit", { name: row.name }),
          })
        }
        onNew={() => setDrawer(edit({ name: "" }))}
        onOpen={(tagId) => onLoad({ ...query, page: 1, tab: "all", tag: tagId })}
        onRemove={onRemoveTag}
        projectId={projectId}
        snapshot={snapshot}
        view={tags}
      />
    );
  }
  if (query.tab === "existing-vs-new") {
    return (
      <PagesExistingPanel
        canWrite={canCreate}
        comparison={comparison}
        onQuery={onLoad}
        onTaken={onSnapshot}
        projectId={projectId}
        query={query}
        snapshot={snapshot}
        tags={tags.options}
        take={takeSnapshot}
      />
    );
  }
  if (query.tab === "compare") {
    return (
      <PagesComparePanel compare={compare} onQuery={onLoad} projectId={projectId} query={query} />
    );
  }
  return (
    <ProjectPagesAllPanel
      canCreate={canCreate}
      canEdit={canEdit}
      canWrite={canWrite}
      columns={columns}
      list={list}
      narrowed={narrowed}
      onCheckVitals={onCheckVitals}
      onFilters={() => setFiltersOpen(true)}
      onNewTag={() => setDrawer(edit({ name: "" }))}
      onPaste={() => setPasteOpen(true)}
      onQuery={onLoad}
      onRefresh={onRefresh}
      onSearchChange={onSearchChange}
      onSetTags={onSetTags}
      pending={pending}
      projectId={projectId}
      query={query}
      search={search}
      snapshot={snapshot}
      sources={sources}
      tags={tags.options}
    />
  );
}
