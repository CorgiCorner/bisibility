"use client";

import { DefaultProjectStar } from "@/components/shell/DefaultProjectStar";
import { WorkspaceTile } from "@/components/shell/WorkspaceTile";
import {
  truncateProjectName,
  type WorkspaceLabelFormatter,
  workspaceRowMeta,
} from "@/components/shell/workspace-labels";
import { MenuItem } from "@/components/ui/MenuItem";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { menuItemRowHoverStyle } from "@/lib/ui/menu-item-row-styles";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useRef } from "react";

/** Shared by workspace rows and the settings/create actions below the separator. */
export const MENU_ROW_STYLE = {
  alignItems: "center",
  borderRadius: UI_RADIUS_ROLES.control,
  fontSize: "13px",
  fontWeight: 500,
  gap: "10px",
  marginBottom: "4px",
  minHeight: 0,
  paddingLeft: "9px",
  paddingRight: "9px",
  paddingTop: "8px",
  paddingBottom: "8px",
  // The fill belongs to the pointer alone; selection is the check glyph, never a fill.
  ...menuItemRowHoverStyle,
} as const;

// The row wrapper carries the bottom margin, so the absolutely placed star centers on the item.
const ROW_ITEM_STYLE = { ...MENU_ROW_STYLE, marginBottom: 0 } as const;

export type WorkspaceRowProps = {
  workspace: WorkspaceSummary;
  active: boolean;
  onSelect: () => void;
  /** Present when the viewer may star this project; the entry page opens only onboarded ones. */
  defaultStar?: { isDefault: boolean; onToggle: () => void };
};

export function WorkspaceRow({
  workspace,
  active,
  onSelect,
  defaultStar,
}: Readonly<WorkspaceRowProps>) {
  const t = useTranslations("shell.workspace");
  const starRef = useRef<HTMLButtonElement>(null);
  const labels: WorkspaceLabelFormatter = {
    keywordCount: (count) => t("keywordCount", { count }),
    newProject: () => t("newProject"),
    noData: (count) => t("noData", { count }),
  };
  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowRight" || !starRef.current) return;
    event.preventDefault();
    starRef.current.focus();
  }
  return (
    <div className="group/workspace-row relative mb-1" data-workspace-row>
      <MenuItem
        aria-current={active ? "true" : undefined}
        // Hovering the star leaves the item, so the wrapper keeps the row's pointer fill.
        className="group-has-[[data-default-star]:hover]/workspace-row:bg-bg-sunken"
        component={Link}
        href={appPath(workspace.publicId, "dashboard")}
        onClick={onSelect}
        onKeyDown={handleRowKeyDown}
        style={ROW_ITEM_STYLE}
      >
        <WorkspaceTile domain={workspace.domain} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-tight text-fg">
            <span className="truncate">{truncateProjectName(workspace.name)}</span>
            {workspace.isSample ? (
              <span className="rounded-full border border-border px-1.5 py-px text-[9px] uppercase text-fg-muted">
                {t("sample")}
              </span>
            ) : null}
          </span>
          <span className="mt-px block text-[10px] text-fg-muted">
            {workspaceRowMeta(workspace, labels)}
          </span>
        </span>
        {/* Reserves the star's slot on every row, so starring never shifts the name. */}
        <span aria-hidden className="w-6 flex-none" />
        {/* Kept in the DOM on every row and toggled with visibility, so opening the menu never
            relayouts the rows. --accent-solid, not --accent: the check is a non-text indicator
            (SC 1.4.11 wants 3:1) and --accent lands at 2.97:1 on the menu surface in light.
            Same rule as the nav dot. */}
        <Check
          aria-hidden
          className="flex-none text-accent-solid"
          data-workspace-check
          size={16}
          style={{ visibility: active ? "visible" : "hidden" }}
          weight="regular"
        />
      </MenuItem>
      {defaultStar ? (
        // right = row padding (9px) + check (16px) + gap (10px), so the star fills its slot.
        <span className="absolute top-1/2 right-[35px] flex -translate-y-1/2">
          <DefaultProjectStar
            isDefault={defaultStar.isDefault}
            onToggle={defaultStar.onToggle}
            projectName={workspace.name}
            ref={starRef}
          />
        </span>
      ) : null}
    </div>
  );
}
