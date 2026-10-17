"use client";

import { Divider } from "@/components/ui/Divider";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import type { CanonicalSavedViewResource } from "@/lib/saved-views/canonical-model";
import type { PersonalViewLabels } from "./personal-control-types";

type Props = {
  anchor: HTMLElement | null;
  active: CanonicalSavedViewResource | null;
  activeViewId: string | null;
  labels: PersonalViewLabels;
  modified: boolean;
  pending: boolean;
  views: readonly CanonicalSavedViewResource[];
  writable: boolean;
  onClose: () => void;
  onDelete: () => void;
  onDiscard: () => void;
  onSelect: (view: CanonicalSavedViewResource | null) => void;
  onSetDefault: () => void;
};

export function PersonalViewMenu({
  anchor,
  active,
  activeViewId,
  labels,
  modified,
  pending,
  views,
  writable,
  onClose,
  onDelete,
  onDiscard,
  onSelect,
  onSetDefault,
}: Readonly<Props>) {
  return (
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={onClose}>
      <MenuItem selected={!activeViewId} onClick={() => onSelect(null)}>
        {labels.general}
      </MenuItem>
      {views.map((view) => (
        <MenuItem key={view.id} selected={view.id === activeViewId} onClick={() => onSelect(view)}>
          <span className="min-w-0 flex-1 truncate">{view.name}</span>
          <span className="ml-3 text-[11px] text-fg-muted">
            {view.visibility === "private" ? labels.personal : labels.project}
          </span>
        </MenuItem>
      ))}
      <Divider />
      {modified ? (
        <>
          <MenuItem
            disabled={pending}
            onClick={() => {
              onClose();
              onDiscard();
            }}
          >
            {labels.discard}
          </MenuItem>
          <Divider />
        </>
      ) : null}
      <MenuItem disabled={!writable || Boolean(activeViewId && !active)} onClick={onSetDefault}>
        {labels.setDefault}
      </MenuItem>
      {active?.canDelete ? (
        <MenuItem disabled={!writable} onClick={onDelete}>
          {labels.delete}
        </MenuItem>
      ) : null}
    </Menu>
  );
}
