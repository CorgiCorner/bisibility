"use client";

import { actionErrorMessage } from "@/components/keywords/action-utils";
import { Button, Tooltip, useToast } from "@/components/ui";
import {
  type CreateSavedViewInput,
  type DeleteSavedViewInput,
  type KeywordSavedView,
  type SavedViewConfig,
  savedViewHref,
} from "@/lib/keywords/saved-view-model";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import {
  BookmarkSimpleIcon as BookmarkSimple,
  CaretDownIcon as CaretDown,
  CheckIcon as Check,
  PlusIcon as Plus,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
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
          showToast("View deleted", { tint: "neutral" });
          if (viewId === activeViewId) {
            router.push(savedViewHref(projectId, null));
          } else {
            router.refresh();
          }
        })
        .catch((error) => showToast(actionErrorMessage(error), { tint: "red" }));
    });
  }

  return (
    <>
      <Button
        aria-controls={open ? "keyword-saved-views-menu" : undefined}
        aria-expanded={open ? "true" : undefined}
        aria-haspopup="menu"
        onClick={(event) => setAnchorEl(event.currentTarget)}
        size="sm"
        startIcon={<BookmarkSimple size={15} />}
        sx={{
          color: activeView ? "var(--accent)" : "var(--fg-muted)",
          maxWidth: 190,
        }}
        variant="secondary"
      >
        <span className="min-w-0 truncate">{activeView?.name ?? "All keywords"}</span>
        <CaretDown className="ml-1 shrink-0" size={12} />
      </Button>
      <Menu
        anchorEl={anchorEl}
        id="keyword-saved-views-menu"
        onClose={() => setAnchorEl(null)}
        open={open}
        slotProps={{ paper: { sx: { border: "1px solid var(--border)", minWidth: 240 } } }}
      >
        <div className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
          Saved views
        </div>
        <MenuItem onClick={() => applyView(null)} selected={!activeViewId}>
          <span className="mr-2 grid h-4 w-4 place-items-center">
            {!activeViewId ? <Check size={13} weight="bold" /> : null}
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
                {view.id === activeViewId ? <Check size={13} weight="bold" /> : null}
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
                    sx={{ color: "var(--fg-muted)", ml: 1 }}
                  >
                    <Trash size={13} />
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
            <Plus size={13} weight="bold" />
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
