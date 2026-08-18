"use client";

import { TeamMembersCard } from "@/components/settings/team/TeamMembersCard";
import { TeamPendingInvitesCard } from "@/components/settings/team/TeamPendingInvitesCard";
import { TeamRolesAccessCard } from "@/components/settings/team/TeamRolesAccessCard";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import type { TeamAccessView } from "@/lib/queries/team";

type AssignableRole = "admin" | "member" | "viewer";
type MemberAction = (input: { memberId: string; projectId: string }) => Promise<unknown>;
type InviteAction = (input: { inviteId: string; projectId: string }) => Promise<unknown>;

export type TeamSettingsContentProps = {
  actions: {
    changeMemberRole: (input: {
      memberId: string;
      projectId: string;
      role: AssignableRole;
    }) => Promise<unknown>;
    inviteMember: (input: {
      email: string;
      projectId: string;
      role: AssignableRole;
    }) => Promise<{ inviteLink: string }>;
    removeMember: MemberAction;
    resendInvite: InviteAction;
    revokeInvite: InviteAction;
    transferOwnership: MemberAction;
  };
  domain: string;
  projectId: string;
  readOnly?: boolean;
  team: TeamAccessView;
};

export function TeamSettingsContent({
  actions,
  domain,
  projectId,
  readOnly = false,
  team,
}: Readonly<TeamSettingsContentProps>) {
  const { readOnly: contextReadOnly } = useProjectWriteMode();
  const projectReadOnly = readOnly || contextReadOnly;
  return (
    <div className="space-y-3.5" data-team-settings-content="">
      <TeamMembersCard
        canAssignAdmin={team.canAssignAdmin}
        canManageTeam={team.canManageTeam}
        changeMemberRole={actions.changeMemberRole}
        domain={domain}
        inviteMember={actions.inviteMember}
        members={team.members}
        projectId={projectId}
        readOnly={projectReadOnly}
        removeMember={actions.removeMember}
        transferOwnership={actions.transferOwnership}
      />
      <TeamPendingInvitesCard
        canManageTeam={team.canManageTeam}
        invites={team.pendingInvites}
        projectId={projectId}
        readOnly={projectReadOnly}
        resendInvite={actions.resendInvite}
        revokeInvite={actions.revokeInvite}
      />
      <TeamRolesAccessCard />
    </div>
  );
}
