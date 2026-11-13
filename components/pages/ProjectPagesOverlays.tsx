"use client";

import type { ProjectPageTagView } from "@/lib/pages/tag-view";
import type { AddManualProjectPagesResult } from "@/lib/pages/types";
import type { ProjectPagesQuery } from "@/lib/pages/url-state";
import type { PageTagFormValues } from "@/lib/schemas/page-tag";
import { type PageTagDraft, PageTagDrawer, type PageTagPreview } from "./PageTagDrawer";
import { ProjectPagesFilters } from "./ProjectPagesFilters";
import { ProjectPagesPasteDialog } from "./ProjectPagesPasteDialog";

export function ProjectPagesOverlays({
  addManual,
  canWrite,
  drawer,
  filtersOpen,
  onAdded,
  onCloseDrawer,
  onCloseFilters,
  onQuery,
  onSave,
  pasteOpen,
  previewRule,
  projectId,
  query,
  setPasteOpen,
  sitemaps,
  tagOptions,
}: Readonly<{
  addManual: (input: { projectId: string; text: string }) => Promise<AddManualProjectPagesResult>;
  canWrite: boolean;
  drawer: { form: PageTagFormValues; tagId?: string; title: string } | null;
  filtersOpen: boolean;
  onAdded: () => void;
  onCloseDrawer: () => void;
  onCloseFilters: () => void;
  onQuery: (query: ProjectPagesQuery) => void;
  onSave: (values: PageTagFormValues) => Promise<void>;
  pasteOpen: boolean;
  previewRule: (draft: PageTagDraft) => Promise<PageTagPreview>;
  projectId: string;
  query: ProjectPagesQuery;
  setPasteOpen: (open: boolean) => void;
  sitemaps: ProjectPageTagView["sitemaps"];
  tagOptions: ProjectPageTagView["options"];
}>) {
  return (
    <>
      <ProjectPagesFilters
        onClose={onCloseFilters}
        onQuery={onQuery}
        open={filtersOpen}
        query={query}
      />
      <ProjectPagesPasteDialog
        onAdded={onAdded}
        onClose={() => setPasteOpen(false)}
        onSubmit={(text) => addManual({ projectId, text })}
        open={pasteOpen}
      />
      {drawer ? (
        <PageTagDrawer
          canWrite={canWrite}
          initial={drawer.form}
          key={`${drawer.tagId ?? "new"}:${drawer.title}`}
          onClose={onCloseDrawer}
          open
          options={tagOptions}
          preview={previewRule}
          save={onSave}
          sitemaps={sitemaps}
          title={drawer.title}
        />
      ) : null}
    </>
  );
}
