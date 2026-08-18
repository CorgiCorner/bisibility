"use client";

import { type ConfirmKind, ConfirmModal, Tooltip } from "@/components/ui";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { DotsThreeIcon as DotsThree } from "@phosphor-icons/react";
import { useState } from "react";

export type AssignableTeamRole = "admin" | "member" | "viewer";

export type TeamMemberRoleOption = {
  label: string;
  secondary: string;
  value: AssignableTeamRole;
};

type TeamMemberActionsMenuProps = {
  canChangeRole: boolean;
  canRemove: boolean;
  canTransferOwnership: boolean;
  hasAuditAccess: boolean;
  memberName: string;
  onChangeRole: (role: AssignableTeamRole) => void;
  onRemove: () => void;
  onTransferOwnership: () => void;
  pending: boolean;
  roleOptions: readonly TeamMemberRoleOption[];
};

type MenuView = "actions" | "roles";

const memberMenuPaperSx = {
  backgroundColor: "var(--color-bg-elev)",
  border: "1px solid var(--color-border)",
  borderRadius: "12px",
  boxShadow: "none",
  color: "var(--color-fg)",
  marginTop: "6px",
  minWidth: 196,
  padding: "6px",
};

const memberMenuRowSx = {
  borderRadius: "7px",
  fontSize: "12.5px",
  minHeight: 34,
  "&.Mui-focusVisible, &:hover": { backgroundColor: "var(--color-bg-hover)" },
};

export function TeamMemberActionsMenu({
  canChangeRole,
  canRemove,
  canTransferOwnership,
  hasAuditAccess,
  memberName,
  onChangeRole,
  onRemove,
  onTransferOwnership,
  pending,
  roleOptions,
}: Readonly<TeamMemberActionsMenuProps>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirmation, setConfirmation] = useState<Extract<
    ConfirmKind,
    "removeTeamMember" | "transferProjectOwnership"
  > | null>(null);
  const [view, setView] = useState<MenuView>("actions");
  const open = Boolean(anchor);

  function closeMenu() {
    setAnchor(null);
    setView("actions");
  }

  function requestConfirmation(
    kind: Extract<ConfirmKind, "removeTeamMember" | "transferProjectOwnership">,
  ) {
    closeMenu();
    setConfirmation(kind);
  }

  function confirmAction() {
    const action = confirmation;
    setConfirmation(null);
    if (action === "transferProjectOwnership") onTransferOwnership();
    if (action === "removeTeamMember") onRemove();
  }

  return (
    <>
      <Tooltip content={`Actions for ${memberName}`}>
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Actions for ${memberName}`}
          className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border-strong bg-bg-elev text-fg-muted hover:border-accent hover:text-accent-text disabled:cursor-wait disabled:opacity-60"
          disabled={pending}
          onClick={(event) => setAnchor(event.currentTarget)}
          type="button"
        >
          <DotsThree aria-hidden size={16} weight="bold" />
        </button>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        onClose={closeMenu}
        open={open}
        slotProps={{
          list: { "aria-label": `Actions for ${memberName}`, dense: true, sx: { padding: 0 } },
          paper: { sx: memberMenuPaperSx },
        }}
      >
        {view === "actions"
          ? [
              hasAuditAccess ? (
                <li
                  className="px-3 pb-1 pt-2 text-[11.5px] leading-5 text-fg-muted"
                  key="audit-explanation"
                >
                  Viewer / audit is a managed audit role and cannot be represented as a normal
                  assignable role.
                </li>
              ) : null,
              canChangeRole ? (
                <MenuItem key="change-role" onClick={() => setView("roles")} sx={memberMenuRowSx}>
                  Change role
                </MenuItem>
              ) : null,
              canTransferOwnership ? (
                <MenuItem
                  key="transfer-ownership"
                  onClick={() => requestConfirmation("transferProjectOwnership")}
                  sx={memberMenuRowSx}
                >
                  Transfer ownership
                </MenuItem>
              ) : null,
              canRemove ? (
                <MenuItem
                  key="remove-member"
                  onClick={() => requestConfirmation("removeTeamMember")}
                  sx={memberMenuRowSx}
                >
                  Remove from project
                </MenuItem>
              ) : null,
            ]
          : [
              <MenuItem key="back" onClick={() => setView("actions")} sx={memberMenuRowSx}>
                Back to actions
              </MenuItem>,
              ...roleOptions.map((role) => (
                <MenuItem
                  key={role.value}
                  onClick={() => {
                    closeMenu();
                    onChangeRole(role.value);
                  }}
                  sx={memberMenuRowSx}
                >
                  <span className="flex min-w-0 flex-col">
                    <span>{role.label}</span>
                    <span className="text-[11px] text-fg-muted">{role.secondary}</span>
                  </span>
                </MenuItem>
              )),
            ]}
      </Menu>
      <ConfirmModal
        kind={confirmation ?? "removeTeamMember"}
        onClose={() => setConfirmation(null)}
        onConfirm={confirmAction}
        open={confirmation != null}
        showConfirmationToast={false}
      />
    </>
  );
}
