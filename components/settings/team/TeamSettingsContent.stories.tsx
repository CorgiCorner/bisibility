import { withTeamSettingsMessages } from "@/.storybook/team-settings-messages";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { TeamSettingsContent } from "@/components/settings/team/TeamSettingsContent";
import {
  TeamSettingsContentLoading,
  TeamSettingsLoading,
} from "@/components/settings/team/TeamSettingsLoading";
import type { TeamAccessView, TeamMemberData } from "@/lib/queries/team";
import type { Meta, StoryObj } from "@storybook/react";

const projectRef = "prj_7Kd2Qf9m";
const actions = {
  changeMemberRole: async () => undefined,
  inviteMember: async () => ({ inviteLink: "https://example.com/invite/story" }),
  removeMember: async () => undefined,
  resendInvite: async () => undefined,
  revokeInvite: async () => undefined,
  transferOwnership: async () => undefined,
};

function member(overrides: Partial<TeamMemberData>): TeamMemberData {
  return {
    accessSince: "2025-02-04",
    accessLabel: "Project access since 4 Feb 2025",
    canChangeRole: true,
    canRemove: true,
    canTransferOwnership: true,
    color: "blue",
    email: "member@example.com",
    hasAuditAccess: false,
    id: "mbr_story_member",
    initials: "ME",
    isCurrentUser: false,
    name: "Member Example",
    role: "Editor",
    roleValue: "member",
    ...overrides,
  };
}

const settledTeam: TeamAccessView = {
  canAssignAdmin: true,
  canManageTeam: true,
  canTransferOwnership: true,
  members: [
    member({
      canChangeRole: false,
      canRemove: false,
      canTransferOwnership: false,
      color: "accent",
      email: "owner@example.com",
      id: "mbr_story_owner",
      initials: "OE",
      isCurrentUser: true,
      name: "Owner Example",
      role: "Owner",
      roleValue: "owner",
    }),
    member({}),
    member({
      canTransferOwnership: false,
      color: "purple",
      email: "viewer@example.com",
      id: "mbr_story_viewer",
      initials: "VE",
      name: "Viewer Example",
      role: "Viewer",
      roleValue: "viewer",
    }),
  ],
  pendingInvites: [
    {
      email: "editor@example.com",
      expiresAt: "2026-09-18T12:00:00.000Z",
      expired: false,
      expiresLabel: "expires in 5d",
      id: "inv_story_editor",
      invitedAt: "2026-09-11T12:00:00.000Z",
      invitedByLabel: "Owner Example (owner@example.com)",
      invitedLabel: "invited 2d ago",
      role: "Editor",
      roleValue: "member",
    },
    {
      email: "partner@example.org",
      expiresAt: "2026-09-20T12:00:00.000Z",
      expired: false,
      expiresLabel: "expires in 7d",
      id: "inv_story_viewer",
      invitedAt: "2026-09-13T06:00:00.000Z",
      invitedByLabel: "Owner Example (owner@example.com)",
      invitedLabel: "invited 6h ago",
      role: "Viewer",
      roleValue: "viewer",
    },
    {
      email: "expired@example.com",
      expiresAt: "2026-09-09T12:00:00.000Z",
      expired: true,
      expiresLabel: "expired 4d ago",
      id: "inv_story_expired",
      invitedAt: "2026-09-02T12:00:00.000Z",
      invitedByLabel: "Owner Example (owner@example.com)",
      invitedLabel: "invited 11d ago",
      role: "Editor",
      roleValue: "member",
    },
  ],
  now: "2026-09-13T12:00:00.000Z",
};

const meta = {
  args: { activeSection: "team", children: null, projectRef },
  component: SettingsShell,
  decorators: [
    withTeamSettingsMessages,
    (Story) => (
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <Story />
      </main>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Team",
} satisfies Meta<typeof SettingsShell>;

export default meta;
type Story = StoryObj<typeof meta>;

function TeamStory({ team }: Readonly<{ team: TeamAccessView }>) {
  return (
    <SettingsShell activeSection="team" projectRef={projectRef}>
      <div data-settings-section-slot="team">
        <TeamSettingsContent
          actions={actions}
          domain="example.com"
          projectId={projectRef}
          team={team}
        />
      </div>
    </SettingsShell>
  );
}

export const Settled: Story = { render: () => <TeamStory team={settledTeam} /> };

export const AuditorAccess: Story = {
  render: () => (
    <TeamStory
      team={{
        ...settledTeam,
        members: [
          settledTeam.members[0],
          member({
            email: "auditor@example.com",
            hasAuditAccess: true,
            id: "mbr_story_auditor",
            initials: "AE",
            name: "Audit Example",
            role: "Viewer",
            roleValue: "viewer",
          }),
          settledTeam.members[2],
        ],
      }}
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <SettingsShell activeSection="team" projectRef={projectRef}>
      <div data-settings-section-slot="team">
        <TeamSettingsContentLoading />
      </div>
    </SettingsShell>
  ),
};

export const RouteLoading: Story = {
  name: "Route loading",
  render: () => <TeamSettingsLoading />,
};
