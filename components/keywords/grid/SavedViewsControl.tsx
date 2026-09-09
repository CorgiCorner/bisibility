"use client";

import { actionErrorMessage } from "@/components/keywords/action-utils";
import { Divider } from "@/components/ui/Divider";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { menuSelectTriggerClass } from "@/components/ui/MenuSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/toast-context";
import {
  type CreateSavedViewInput,
  type DeleteSavedViewInput,
  type KeywordSavedView,
  type SavedViewConfig,
  savedViewHref,
} from "@/lib/keywords/saved-view-model";
import { cn } from "@/lib/ui/cn";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveViewModal } from "./SaveViewModal";

type SavedViewsControlProps = {
  activeFiltersSummary: string;
  activeViewId: string | null;
  config: SavedViewConfig;
  createSavedViewAction?: (input: CreateSavedViewInput) => Promise<KeywordSavedView>;
  deletableSavedViewIds: readonly string[];
  deleteSavedViewAction?: (input: DeleteSavedViewInput) => Promise<unknown>;
  projectId: string;
  savedViews: KeywordSavedView[];
};

export function SavedViewsControl({
  activeFiltersSummary,
  activeViewId,
  config,
  createSavedViewAction,
  deletableSavedViewIds,
  deleteSavedViewAction,
  projectId,
  savedViews,
}: Readonly<SavedViewsControlProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isPending, startTransition] = useTransition();
  const [saveOpen, setSaveOpen] = useState(false);
  const activeView = savedViews.find((view) => view.id === activeViewId) ?? null;
  const deletableSavedViewIdSet = new Set(deletableSavedViewIds);
  const open = Boolean(anchorEl);

  function applyView(view: KeywordSavedView | null) {
    setAnchorEl(null);
    router.push(
      view ? savedViewHref(projectId, view.id, view.config.lens) : savedViewHref(projectId, null),
    );
  }

  function deleteView(viewId: string) {
    if (!deleteSavedViewAction || !deletableSavedViewIdSet.has(viewId)) {
      return;
    }

    setAnchorEl(null);
    startTransition(() => {
      void deleteSavedViewAction({ projectId, viewId })
        .then(() => {
          showToast("View deleted", { severity: "success" });
          if (viewId === activeViewId) {
            router.push(savedViewHref(projectId, null));
          } else {
            router.refresh();
          }
        })
        .catch((error) => showToast(actionErrorMessage(error), { severity: "error" }));
    });
  }

  return (
    <>
      <button
        aria-controls={open ? "keyword-saved-views-menu" : undefined}
        aria-expanded={open ? "true" : undefined}
        aria-haspopup="menu"
        className={cn(menuSelectTriggerClass, "max-w-[190px]")}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        type="button"
      >
        <span className="flex shrink-0 text-fg-muted">
          <BookmarkSimple weight="regular" aria-hidden size={15} />
        </span>
        <span className="min-w-0 truncate text-fg">{activeView?.name ?? "All keywords"}</span>
        <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="regular" />
      </button>
      <Menu
        anchorEl={anchorEl}
        id="keyword-saved-views-menu"
        onClose={() => setAnchorEl(null)}
        open={open}
        contentProps={{ style: { border: "1px solid var(--border)", minWidth: 240 } }}
      >
        <div className="px-4 pb-1 pt-2 font-sans tabular-nums text-[10px] uppercase tracking-[0.6px] text-fg-muted">
          Saved views
        </div>
        <MenuItem onClick={() => applyView(null)} selected={!activeViewId}>
          <span className="mr-2 grid h-4 w-4 place-items-center">
            {!activeViewId ? <Check size={13} weight="regular" /> : null}
          </span>
          {"All keywords "}
        </MenuItem>
        {savedViews.length ? (
          savedViews.map((view) => (
            <MenuItem
              disabled={isPending}
              key={view.id}
              onClick={() => applyView(view)}
              selected={view.id === activeViewId}
            >
              <span className="mr-2 grid h-4 w-4 place-items-center">
                {view.id === activeViewId ? <Check size={13} weight="regular" /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{view.name}</span>
              {deletableSavedViewIdSet.has(view.id) ? (
                <Tooltip content="Delete view">
                  <IconButton
                    aria-label={`Delete ${view.name}`}
                    disabled={isPending || !deleteSavedViewAction}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteView(view.id);
                    }}
                    size="small"
                    style={{ "--control-color": "var(--fg-muted)", marginLeft: 8 }}
                  >
                    <Trash weight="regular" size={13} />
                  </IconButton>
                </Tooltip>
              ) : null}
            </MenuItem>
          ))
        ) : (
          <MenuItem disabled>No saved views yet</MenuItem>
        )}
        <Divider />
        <MenuItem
          disabled={!createSavedViewAction}
          onClick={() => {
            setAnchorEl(null);
            setSaveOpen(true);
          }}
        >
          <span className="mr-2 grid h-4 w-4 place-items-center text-accent-text">
            <Plus size={13} weight="regular" />
          </span>
          {"Save current view "}
        </MenuItem>
      </Menu>
      {saveOpen ? (
        <SaveViewModal
          activeFiltersSummary={activeFiltersSummary}
          config={config}
          createSavedViewAction={createSavedViewAction}
          onClose={() => setSaveOpen(false)}
          open
          projectId={projectId}
        />
      ) : null}
    </>
  );
}
