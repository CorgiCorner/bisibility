"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { InviteModal } from "@/components/settings/team/InviteModal";
import {
  type AssignableTeamRole,
  TeamMemberActionsMenu,
} from "@/components/settings/team/TeamMemberActionsMenu";
import { teamCardGeometryClassNames } from "@/components/settings/team/team-card-layout";
import { useTeamActionError } from "@/components/settings/team/useTeamActionError";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatDisplayDate } from "@/lib/dates/format";
import type { TeamMemberData } from "@/lib/queries/team";
import { cn } from "@/lib/ui/cn";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/dist/csr/UserPlus";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
}) => Promise<{ inviteLink: string; status?: "success" } | { message: string; status: "error" }>;

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

export function TeamMembersCard(props: Readonly<TeamMembersCardProps>) {
  const { canAssignAdmin, canManageTeam, domain, members, projectId, readOnly = false } = props;
  const dateDisplay = useDateDisplay();
  const router = useRouter();
  const presentActionError = useTeamActionError();
  const t = useTranslations("projectSettingsTeam");
  const [actionError, setActionError] = useState<string | null>(null);
  const [changedRoles, setChangedRoles] = useState<Record<string, AssignableRole>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const roleOptions = [
    {
      label: t("members.role.admin"),
      secondary: t("members.roleDescription.admin"),
      value: "admin",
    },
    {
      label: t("members.role.editor"),
      secondary: t("members.roleDescription.editor"),
      value: "member",
    },
    {
      label: t("members.role.viewer"),
      secondary: t("members.roleDescription.viewer"),
      value: "viewer",
    },
  ] as const satisfies readonly {
    label: string;
    secondary: string;
    value: AssignableTeamRole;
  }[];
  const availableRoleOptions = canAssignAdmin
    ? roleOptions
    : roleOptions.filter((option) => option.value !== "admin");

  function roleLabel(member: TeamMemberData, changedRole?: AssignableRole) {
    if (changedRole === "admin" || (!changedRole && member.roleValue === "admin")) {
      return t("members.role.admin");
    }
    if (changedRole === "member" || (!changedRole && member.roleValue === "member")) {
      return t("members.role.editor");
    }
    if (member.hasAuditAccess) return t("members.viewerAudit");
    if (member.roleValue === "owner") return t("members.role.owner");
    return t("members.role.viewer");
  }

  async function runAction(key: string, action: () => Promise<unknown>) {
    setActionError(null);
    setPendingAction(key);
    try {
      await action();
      router.refresh();
    } catch (error) {
      setActionError(presentActionError(error, t("errors.teamChange")));
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
      setActionError(presentActionError(error, t("errors.roleChange")));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section aria-label={t("members.title")} data-team-card-frame="members">
      <SettingsCard
        className={teamCardGeometryClassNames.members}
        description={t("members.description", { domain: domain || t("members.thisProject") })}
        showSave={false}
        title={t("members.title")}
      >
        <div>
          <div className="divide-y divide-border rounded-control border border-border">
            {members.map((member) => {
              const actionPending = pendingAction?.endsWith(member.id);
              const rolePending = pendingAction === `role:${member.id}`;
              const canAct =
                !readOnly &&
                (member.canChangeRole || member.canTransferOwnership || member.canRemove);
              return (
                <div
                  className="flex flex-wrap items-center gap-2 p-3 sm:gap-3"
                  data-team-member-row=""
                  key={member.id}
                >
                  <Avatar
                    alt=""
                    className={cn(
                      "grid h-8.5 w-[34px] shrink-0 place-items-center rounded-control font-sans tabular-nums text-xs font-semibold",
                      avatarColors[member.color],
                    )}
                    initials={member.initials}
                    src={member.avatarUrl}
                  />
                  <span className="min-w-[140px] flex-1">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                      <span className="truncate">{member.name}</span>
                      {member.isCurrentUser ? (
                        <StatusPill
                          label={t("members.you")}
                          showDot={false}
                          size="sm"
                          status="optional"
                        />
                      ) : null}
                    </span>
                    <span className="block truncate font-sans tabular-nums text-[11.5px] text-fg-muted">
                      {member.email}
                    </span>
                    <span className="block truncate text-[11px] text-fg-muted">
                      {t("members.accessSince", {
                        date: formatDisplayDate(member.accessSince, dateDisplay),
                      })}
                    </span>
                  </span>
                  <StatusPill
                    label={roleLabel(member, changedRoles[member.id])}
                    showDot={false}
                    size={member.hasAuditAccess ? "sm" : "md"}
                    status="optional"
                  />
                  {rolePending ? (
                    <span className="text-[11.5px] text-fg-muted" role="status">
                      {t("members.updatingRole")}
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
              className="mt-5 flex justify-end border-t border-border pt-4"
              data-team-members-footer=""
            >
              <Button
                disabled={readOnly}
                onClick={() => setInviteOpen(true)}
                size="sm"
                startIcon={<UserPlus aria-hidden size={14} weight="regular" />}
                type="button"
              >
                {t("members.inviteMember")}
              </Button>
            </div>
          ) : null}
          {canManageTeam ? (
            <InviteModal
              canAssignAdmin={canAssignAdmin}
              domain={domain || t("members.thisProject")}
              inviteMember={props.inviteMember}
              onClose={() => setInviteOpen(false)}
              onInviteSent={() => router.refresh()}
              open={inviteOpen}
              projectId={projectId}
            />
          ) : null}
        </div>
      </SettingsCard>
    </section>
  );
}
