"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { useToast } from "@/components/ui/toast-context";
import type { CompareView } from "@/lib/pages/compare-model";
import type {
  ActivePageSnapshot,
  ExistingVsNewView,
  TakePageSnapshotResult,
} from "@/lib/pages/snapshot-view";
import type { ProjectPageTagView } from "@/lib/pages/tag-view";
import { emptyProjectPageTagView } from "@/lib/pages/tag-view";
import type {
  AddManualProjectPagesResult,
  ProjectPageColumnSource,
  ProjectPagesListResult,
  SyncProjectPagesResult,
} from "@/lib/pages/types";
import {
  type ProjectPagesQuery,
  projectPagesHref,
  type projectPagesLoadRequest,
} from "@/lib/pages/url-state";
import type { PageVitalsActionResult } from "@/lib/pagespeed/view";
import type { PageTagFormValues } from "@/lib/schemas/page-tag";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ComponentProps, useState, useTransition } from "react";
import type { PageTagDraft, PageTagPreview } from "./PageTagDrawer";
import { ProjectPagesBody } from "./ProjectPagesBody";
import { ProjectPagesOverlays } from "./ProjectPagesOverlays";
import { ProjectPagesTabs } from "./ProjectPagesTabs";
import { useProjectPagesColumns } from "./project-pages-columns";
import { projectPagesBlocks, projectPagesLayoutClassName } from "./project-pages-layout";

export type ProjectPagesActions = {
  addManual: (input: { projectId: string; text: string }) => Promise<AddManualProjectPagesResult>;
  checkVitals: (input: { paths: string[]; projectId: string }) => Promise<PageVitalsActionResult>;
  load: (input: ReturnType<typeof projectPagesLoadRequest>) => Promise<ProjectPagesListResult>;
  loadCompare: (input: {
    annotation?: string;
    changed?: string;
    metric?: ProjectPagesQuery["compareMetric"];
    unchanged?: string;
  }) => Promise<CompareView>;
  loadComparison: (input: {
    conversionSource?: ProjectPagesQuery["conv"];
    metric?: ProjectPagesQuery["metric"];
    span: ProjectPagesQuery["span"];
    tag?: string;
  }) => Promise<ExistingVsNewView>;
  loadTags: () => Promise<ProjectPageTagView>;
  previewRule: (draft: PageTagDraft) => Promise<PageTagPreview>;
  refresh: (input: { projectId: string }) => Promise<SyncProjectPagesResult>;
  removeFromPages: (tagId: string) => Promise<unknown>;
  saveRule: (input: PageTagFormValues & { tagId?: string }) => Promise<unknown>;
  setManual: (input: { add: string[]; remove: string[]; tagId: string }) => Promise<unknown>;
  takeSnapshot: (input: {
    confirm?: boolean;
    projectId: string;
  }) => Promise<TakePageSnapshotResult>;
};

type DrawerState = {
  form: PageTagFormValues;
  tagId?: string;
  title: string;
};

export function ProjectPagesScreen(props: ComponentProps<typeof ProjectPagesPanel>) {
  // URL state and data come from the server; router navigation owns browser history.
  return (
    <ProjectPagesPanel key={projectPagesHref(props.projectId, props.initialQuery)} {...props} />
  );
}

function ProjectPagesPanel({
  actions,
  canCreateTags,
  canDeleteTags,
  canEditTags,
  canWrite,
  initialComparison: comparison = null,
  initialCompare: compare = null,
  initialList: list,
  initialQuery: query,
  initialSnapshot: snapshot = null,
  initialTags: tags = emptyProjectPageTagView,
  projectId,
  sources,
}: Readonly<{
  actions: ProjectPagesActions;
  canCreateTags: boolean;
  canDeleteTags: boolean;
  canEditTags: boolean;
  canWrite: boolean;
  initialComparison?: ExistingVsNewView | null;
  initialCompare?: CompareView | null;
  initialList: ProjectPagesListResult;
  initialQuery: ProjectPagesQuery;
  initialSnapshot?: ActivePageSnapshot | null;
  initialTags?: ProjectPageTagView;
  projectId: string;
  sources: readonly ProjectPageColumnSource[];
}>) {
  const t = useTranslations("projectPages");
  const { showToast } = useToast();
  const writeMode = useProjectWriteMode();
  const writable = canWrite && !writeMode.readOnly;
  const createTags = canCreateTags && !writeMode.readOnly;
  const editTags = canEditTags && !writeMode.readOnly;
  const deleteTags = canDeleteTags && !writeMode.readOnly;
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [search, setSearch] = useState(query.search);
  const [mutating, setPending] = useState(false);
  const pending = navigating || mutating;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const columns = useProjectPagesColumns(projectId, sources, snapshot !== null, list.conversions);
  const narrowed = Boolean(
    query.search || query.index || query.coverage || query.cwv || query.source || query.tag,
  );

  function load(next: ProjectPagesQuery) {
    startNavigation(() => {
      const href = projectPagesHref(projectId, next);
      if (href === projectPagesHref(projectId, query)) router.refresh();
      else router.push(href, { scroll: false });
    });
  }

  async function refresh() {
    setPending(true);
    try {
      const result = await actions.refresh({ projectId });
      if (result.status !== "ok") {
        showToast(t("refresh.failed"), { severity: "error" });
        return;
      }
      showToast(t("refresh.done", { count: result.pages }), { severity: "success" });
      load(query);
    } catch {
      showToast(t("refresh.failed"), { severity: "error" });
    } finally {
      setPending(false);
    }
  }

  async function afterTagChange() {
    load(query);
  }

  function onSnapshot() {
    load(query);
  }

  return (
    <div
      className={projectPagesLayoutClassName}
      data-pages-blocks={projectPagesBlocks[query.tab].join(" ")}
      data-pages-tab={query.tab}
    >
      <ProjectPagesTabs
        count={list.counts.all}
        projectId={projectId}
        query={query}
        tagCount={tags.tagCount}
      />
      <ProjectPagesBody
        canCreate={createTags}
        canDelete={deleteTags}
        canEdit={editTags}
        canWrite={writable}
        columns={columns}
        compare={compare}
        comparison={comparison}
        list={list}
        narrowed={narrowed}
        onCheckVitals={async (paths) => {
          const result = await actions.checkVitals({ paths: paths.slice(0, 25), projectId });
          if (!result.ok) showToast(t(`cwv.error.${result.code}`), { severity: "error" });
          else showToast(t("cwv.checked", { count: result.checked }), { severity: "success" });
          if (result.ok || result.checked > 0) await load(query);
        }}
        onLoad={(next) => void load(next)}
        onRefresh={() => void refresh()}
        onRemoveTag={async (tagId) => {
          await actions.removeFromPages(tagId);
          await afterTagChange();
        }}
        onSearchChange={setSearch}
        onSetTags={async (input) => {
          try {
            await actions.setManual(input);
            await afterTagChange();
          } catch {
            showToast(t("drawer.saveFailed"), { severity: "error" });
            throw new Error("tag update failed");
          }
        }}
        onSnapshot={onSnapshot}
        pending={pending}
        projectId={projectId}
        query={query}
        search={search}
        setDrawer={setDrawer}
        setFiltersOpen={setFiltersOpen}
        setPasteOpen={setPasteOpen}
        snapshot={snapshot}
        sources={sources}
        tags={tags}
        takeSnapshot={actions.takeSnapshot}
      />
      <ProjectPagesOverlays
        addManual={actions.addManual}
        canWrite={drawer?.tagId ? editTags : createTags}
        drawer={drawer}
        filtersOpen={filtersOpen}
        onAdded={() => void load(query)}
        onCloseDrawer={() => setDrawer(null)}
        onCloseFilters={() => setFiltersOpen(false)}
        onQuery={(next) => void load(next)}
        onSave={async (values) => {
          if (!drawer) return;
          await actions.saveRule({ ...values, tagId: drawer.tagId });
          await afterTagChange();
        }}
        pasteOpen={pasteOpen}
        previewRule={actions.previewRule}
        projectId={projectId}
        query={query}
        setPasteOpen={setPasteOpen}
        sitemaps={tags.sitemaps}
        tagOptions={tags.options}
      />
    </div>
  );
}
