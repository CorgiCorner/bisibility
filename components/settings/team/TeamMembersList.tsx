"use client";

import { MenuSelect, MonoText } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import Tooltip from "@mui/material/Tooltip";
import { CrownSimpleIcon as CrownSimple, UserMinusIcon as UserMinus } from "@phosphor-icons/react";

export type TeamRoleLabel = "Admin" | "Editor" | "Owner" | "Viewer";
export type TeamRoleValue = "admin" | "member" | "owner" | "viewer";

export type TeamMemberData = {
  color: "accent" | "blue" | "purple";
  email: string;
  id: string;
  initials: string;
  name: string;
  role: TeamRoleLabel;
  roleValue?: TeamRoleValue;
};

export type TeamMembersListProps = {
  canManageTeam: boolean;
  canTransferOwnership: boolean;
  members: readonly TeamMemberData[];
  onRemove: (memberId: string) => void;
  onRoleChange: (memberId: string, role: Exclude<TeamRoleValue, "owner">) => void;
  onTransferOwnership: (memberId: string) => void;
  pendingAction: string | null;
};

const colorClass = {
  accent: "bg-accent",
  blue: "bg-blue",
  purple: "bg-purple",
};

const roleClass =
  "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-strong px-3 font-mono text-[11.5px]";
const iconButtonClass =
  "grid h-[30px] w-[30px] place-items-center rounded-lg border border-border-strong bg-bg-elev text-red-text hover:border-red disabled:cursor-not-allowed disabled:opacity-45";
const roleMenuOptions = [
  { label: "Admin", value: "admin" },
  { label: "Editor", value: "member" },
  { label: "Viewer", value: "viewer" },
] as const;

function roleValue(member: TeamMemberData): TeamRoleValue {
  if (member.roleValue) {
    return member.roleValue;
  }
  if (member.role === "Owner") {
    return "owner";
  }
  if (member.role === "Admin") {
    return "admin";
  }
  return member.role === "Viewer" ? "viewer" : "member";
}

export function TeamMembersList({
  canManageTeam,
  canTransferOwnership,
  members,
  onRemove,
  onRoleChange,
  onTransferOwnership,
  pendingAction,
}: Readonly<TeamMembersListProps>) {
  return (
    <div className="divide-y divide-border-soft rounded-[10px] border border-border bg-bg-elev">
      {members.map((member) => {
        const value = roleValue(member);
        const pending = pendingAction?.endsWith(member.id);
        const editable = canManageTeam && value !== "owner" && !pending;

        return (
          <div className="flex flex-wrap items-center gap-3 p-3" key={member.id}>
            <span
              className={cn(
                "grid h-[34px] w-[34px] place-items-center rounded-[9px] font-mono text-xs font-semibold text-white",
                colorClass[member.color],
              )}
            >
              {member.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{member.name}</span>
              <MonoText className="truncate" muted>
                {member.email}
              </MonoText>
            </span>
            {value === "owner" ? (
              <span className={cn(roleClass, "text-fg-muted")}>{member.role}</span>
            ) : (
              <>
                {editable ? (
                  <MenuSelect
                    ariaLabel={`Change role for ${member.name}`}
                    onChange={(nextRole) => {
                      if (nextRole !== value) {
                        onRoleChange(member.id, nextRole as Exclude<TeamRoleValue, "owner">);
                      }
                    }}
                    options={roleMenuOptions}
                    triggerClassName={cn(roleClass, "bg-transparent pr-3 text-fg")}
                    value={value}
                  />
                ) : (
                  <span className={cn(roleClass, "text-fg-muted", pending && "text-fg-muted")}>
                    {member.role}
                  </span>
                )}
                {canTransferOwnership ? (
                  <Tooltip title={`Transfer ownership to ${member.name}`}>
                    <span className="inline-grid">
                      <button
                        aria-label={`Transfer ownership to ${member.name}`}
                        className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border-strong bg-bg-elev text-fg-muted hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={Boolean(pending)}
                        onClick={() => onTransferOwnership(member.id)}
                        type="button"
                      >
                        <CrownSimple aria-hidden size={14} />
                      </button>
                    </span>
                  </Tooltip>
                ) : null}
                {editable ? (
                  <Tooltip title={`Remove ${member.name}`}>
                    <span className="inline-grid">
                      <button
                        aria-label={`Remove ${member.name}`}
                        className={iconButtonClass}
                        onClick={() => onRemove(member.id)}
                        type="button"
                      >
                        <UserMinus aria-hidden size={14} />
                      </button>
                    </span>
                  </Tooltip>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
