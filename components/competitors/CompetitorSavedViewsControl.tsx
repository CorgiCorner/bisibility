"use client";

import { actionErrorMessage } from "@/components/keywords/action-utils";
import { Button, useToast } from "@/components/ui";
import {
  type CompetitorSavedViewConfig,
  competitorSavedViewHref,
} from "@/lib/competitors/saved-view-model";
import { competitorScopeHref } from "@/lib/competitors/scope-model";
import type { DeleteSavedViewInput } from "@/lib/keywords/saved-view-model";
import type { ProjectRef } from "@/lib/routing/app-path";
import type {
  CompetitorSavedView,
  CreateProjectSavedViewInput,
  SavedViewResource,
} from "@/lib/saved-views/model";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import {
  BookmarkSimpleIcon as BookmarkSimple,
  CaretDownIcon as CaretDown,
  CheckIcon as Check,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveCompetitorViewModal } from "./SaveCompetitorViewModal";

type CompetitorSavedViewsControlProps = {
  activeViewId: string | null;
  config: CompetitorSavedViewConfig;
  createSavedViewAction?: (input: CreateProjectSavedViewInput) => Promise<SavedViewResource>;
  deletableSavedViewIds: readonly string[];
  deleteSavedViewAction?: (input: DeleteSavedViewInput) => Promise<unknown>;
  modified: boolean;
  onDiscard: () => void;
  onSaved: () => void;
  projectId: string;
  projectRef: ProjectRef;
  savedViews: CompetitorSavedView[];
};

export function CompetitorSavedViewsControl({
  activeViewId,
  config,
  createSavedViewAction,
  deletableSavedViewIds,
  deleteSavedViewAction,
  modified,
  onDiscard,
  onSaved,
  projectId,
  projectRef,
  savedViews,
}: Readonly<CompetitorSavedViewsControlProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const active = savedViews.find((view) => view.id === activeViewId) ?? null;
  const deletableSavedViewIdSet = new Set(deletableSavedViewIds);

  function remove(view: CompetitorSavedView) {
    if (!deleteSavedViewAction || !deletableSavedViewIdSet.has(view.id)) return;
    setAnchorEl(null);
    startTransition(() => {
      void deleteSavedViewAction({ projectId, viewId: view.id })
        .then(() => {
          showToast("View deleted", { tint: "neutral" });
          if (view.id === activeViewId) {
            router.push(competitorScopeHref(projectRef, config.scope));
          }
          router.refresh();
        })
        .catch((error) => showToast(actionErrorMessage(error), { tint: "red" }));
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={(event) => setAnchorEl(event.currentTarget)}
          size="sm"
          startIcon={<BookmarkSimple aria-hidden size={14} />}
          variant="secondary"
        >
          {active?.name ?? "Comparison views"}
          <CaretDown aria-hidden size={11} />
        </Button>
        {modified ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[10px] font-semibold text-accent-text">
            Unsaved changes
          </span>
        ) : null}
        {createSavedViewAction ? (
          <Button onClick={() => setSaveOpen(true)} size="sm" variant="secondary">
            Save view
          </Button>
        ) : null}
        {modified ? (
          <Button onClick={onDiscard} size="sm" variant="ghost">
            Discard
          </Button>
        ) : null}
      </div>
      <Menu anchorEl={anchorEl} onClose={() => setAnchorEl(null)} open={Boolean(anchorEl)}>
        {savedViews.map((view) => (
          <MenuItem
            disabled={pending}
            key={view.id}
            onClick={() => router.push(competitorSavedViewHref(projectRef, view.id, view.config))}
          >
            <span className="mr-2 grid w-4 place-items-center">
              {view.id === activeViewId ? <Check size={13} weight="bold" /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{view.name}</span>
            {deleteSavedViewAction && deletableSavedViewIdSet.has(view.id) ? (
              <button
                aria-label={`Delete ${view.name}`}
                className="ml-3 text-fg-muted hover:text-red-text"
                onClick={(event) => {
                  event.stopPropagation();
                  remove(view);
                }}
                type="button"
              >
                <Trash aria-hidden size={13} />
              </button>
            ) : null}
          </MenuItem>
        ))}
        {savedViews.length === 0 ? <MenuItem disabled>No saved views yet</MenuItem> : null}
      </Menu>
      {saveOpen ? (
        <SaveCompetitorViewModal
          config={config}
          createSavedViewAction={createSavedViewAction}
          onClose={() => setSaveOpen(false)}
          onSaved={onSaved}
          open
          projectId={projectId}
          projectRef={projectRef}
        />
      ) : null}
    </>
  );
}
