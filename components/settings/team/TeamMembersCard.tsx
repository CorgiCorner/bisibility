"use client";

import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { InviteModal } from "@/components/settings/team/InviteModal";
import {
  type AssignableTeamRole,
  TeamMemberActionsMenu,
} from "@/components/settings/team/TeamMemberActionsMenu";
import { teamCardGeometryClassNames } from "@/components/settings/team/team-card-layout";
import { Avatar, Button, StatusPill } from "@/components/ui";
import type { TeamMemberData } from "@/lib/queries/team";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const roleOptions = [
  { label: "Admin", secondary: "Settings, members and keys", value: "admin" },
  { label: "Editor", secondary: "Keywords, alerts and views", value: "member" },
  { label: "Viewer", secondary: "Dashboards and exports", value: "viewer" },
] as const satisfies readonly {
  label: string;
  secondary: string;
  value: AssignableTeamRole;
}[];

type AssignableRole = AssignableTeamRole;
type MemberAction = (input: { memberId: string; projectId: string }) => Promise<unknown>;
type RoleAction = (input: {
  memberId: string;
  projectId: string;
  role: AssignableRole;
}) => Promise<unknown>;
type InviteAction = (input: {
  email: string;
  projectId: string;
  role: AssignableRole;
}) => Promise<{ inviteLink: string }>;

export type TeamMembersCardProps = {
  canAssignAdmin: boolean;
  canManageTeam: boolean;
  changeMemberRole: RoleAction;
  domain: string;
  inviteMember: InviteAction;
  members: readonly TeamMemberData[];
  projectId: string;
  readOnly?: boolean;
  removeMember: MemberAction;
  transferOwnership: MemberAction;
};

const avatarColors = {
  accent: "bg-accent-soft text-accent-text",
  blue: "bg-blue/15 text-blue-text",
  purple: "bg-purple/15 text-fg",
} as const;

function RoleBadge({ member, role }: Readonly<{ member: TeamMemberData; role?: AssignableRole }>) {
  const roleLabel = roleOptions.find((option) => option.value === role)?.label;

  return (
    <StatusPill
      label={roleLabel ?? (member.hasAuditAccess ? "Viewer / audit" : member.role)}
      showDot={false}
      size={member.hasAuditAccess ? "sm" : "md"}
      status="optional"
    />
  );
}

export function TeamMembersCard(props: Readonly<TeamMembersCardProps>) {
  const { canAssignAdmin, canManageTeam, domain, members, projectId, readOnly = false } = props;
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [changedRoles, setChangedRoles] = useState<Record<string, AssignableRole>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const availableRoleOptions = canAssignAdmin
    ? roleOptions
    : roleOptions.filter((option) => option.value !== "admin");

  async function runAction(key: string, action: () => Promise<unknown>) {
    setActionError(null);
    setPendingAction(key);
    try {
      await action();
      router.refresh();
    } catch (error) {
      setActionError(actionErrorMessage(error, "Team change failed."));
    } finally {
      setPendingAction(null);
    }
  }

  async function changeRole(member: TeamMemberData, role: AssignableRole) {
    const currentRole = changedRoles[member.id] ?? (member.hasAuditAccess ? "" : member.roleValue);
    if (role === currentRole) return;

    setActionError(null);
    setPendingAction(`role:${member.id}`);
    try {
      await props.changeMemberRole({
        memberId: member.id,
        projectId,
        role,
      });
      setChangedRoles((roles) => ({ ...roles, [member.id]: role }));
      router.refresh();
    } catch (error) {
      setActionError(actionErrorMessage(error, "Role could not be changed."));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div data-team-card-frame="members">
      <SettingsCard
        className={teamCardGeometryClassNames.members}
        description={`Everyone with access to ${domain || "this project"}.`}
        showSave={false}
        title="Members"
      >
        <div>
          <div className="divide-y divide-border-soft rounded-[10px] border border-border">
            {members.map((member) => {
              const actionPending = pendingAction?.endsWith(member.id);
              const rolePending = pendingAction === `role:${member.id}`;
              const canAct =
                !readOnly &&
                (member.canChangeRole || member.canTransferOwnership || member.canRemove);
              return (
                <div className="flex flex-wrap items-center gap-2 p-3 sm:gap-3" key={member.id}>
                  <Avatar
                    alt=""
                    className={cn(
                      "grid h-8.5 w-[34px] shrink-0 place-items-center rounded-[9px] font-mono text-xs font-semibold",
                      avatarColors[member.color],
                    )}
                    initials={member.initials}
                    src={member.avatarUrl}
                  />
                  <span className="min-w-[140px] flex-1">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                      <span className="truncate">{member.name}</span>
                      {member.isCurrentUser ? (
                        <StatusPill label="you" showDot={false} size="sm" status="optional" />
                      ) : null}
                    </span>
                    <span className="block truncate font-mono text-[11.5px] text-fg-muted">
                      {member.email}
                    </span>
                    <span className="block truncate text-[11px] text-fg-muted">
                      {member.accessLabel}
                    </span>
                  </span>
                  <RoleBadge member={member} role={changedRoles[member.id]} />
                  {rolePending ? (
                    <span className="text-[11.5px] text-fg-muted" role="status">
                      Updating role…
                    </span>
                  ) : null}
                  {canAct ? (
                    <TeamMemberActionsMenu
                      canChangeRole={member.canChangeRole}
                      canRemove={member.canRemove}
                      canTransferOwnership={member.canTransferOwnership}
                      hasAuditAccess={member.hasAuditAccess}
                      memberName={member.name}
                      onChangeRole={(role) => void changeRole(member, role)}
                      onRemove={() =>
                        void runAction(`remove:${member.id}`, () =>
                          props.removeMember({ memberId: member.id, projectId }),
                        )
                      }
                      onTransferOwnership={() =>
                        void runAction(`transfer:${member.id}`, () =>
                          props.transferOwnership({ memberId: member.id, projectId }),
                        )
                      }
                      pending={Boolean(actionPending)}
                      roleOptions={availableRoleOptions}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          {actionError ? (
            <p className="m-0 mt-3 text-[11.5px] font-medium text-red-text" role="alert">
              {actionError}
            </p>
          ) : null}
          {canManageTeam ? (
            <div
              className="mt-5 flex justify-end border-t border-border-soft pt-4"
              data-team-members-footer=""
            >
              <Button
                disabled={readOnly}
                onClick={() => setInviteOpen(true)}
                size="sm"
                startIcon={<UserPlus aria-hidden size={14} weight="bold" />}
                type="button"
              >
                Invite member
              </Button>
            </div>
          ) : null}
          {canManageTeam ? (
            <InviteModal
              canAssignAdmin={canAssignAdmin}
              domain={domain || "this project"}
              inviteMember={props.inviteMember}
              onClose={() => setInviteOpen(false)}
              onInviteSent={() => router.refresh()}
              open={inviteOpen}
              projectId={projectId}
            />
          ) : null}
        </div>
      </SettingsCard>
    </div>
  );
}
