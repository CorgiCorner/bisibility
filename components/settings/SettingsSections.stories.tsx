import { ApiKeysSection } from "@/components/settings/api-keys/ApiKeysSection";
import { UsageBillingSection } from "@/components/settings/billing/UsageBillingSection";
import { DangerZone } from "@/components/settings/danger/DangerZone";
import { DefaultsSection } from "@/components/settings/defaults/DefaultsSection";
import { NewWorkspaceSettings } from "@/components/settings/NewWorkspaceSettings";
import { NotificationsSection } from "@/components/settings/notifications/NotificationsSection";
import { ProviderUsage } from "@/components/settings/providers/ProviderUsage";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { settingsFixtures } from "@/components/settings/settings-fixtures";
import { TagsSegments } from "@/components/settings/tags/TagsSegments";
import { TeamRoles } from "@/components/settings/team/TeamRoles";
import { ProjectDetails } from "@/components/settings/workspace/ProjectDetails";
import { MonoText } from "@/components/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Settings/Sections",
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <div className="mx-auto max-w-[780px]">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const manageableTeamProps = {
  canManageTeam: true,
  canTransferOwnership: true,
  projectId: "prj_7Kd2Qf9m",
} as const;

const issueStoryKey = async (input: { name: string }) => ({
  maskedValue: "bsb_key_live_story_key******4f2a",
  name: input.name,
  raw: "bsb_key_live_story_key_secret_4f2a",
});

export const SectionWrapper: Story = {
  render: () => (
    <SettingsSection
      description="Reusable title, description and card shell."
      title="Settings section"
    >
      <MonoText muted>Section body</MonoText>
    </SettingsSection>
  ),
};

export const Project: Story = {
  render: () => <ProjectDetails canEdit project={settingsFixtures.project} />,
};

export const Defaults: Story = {
  render: () => <DefaultsSection canEdit defaults={settingsFixtures.defaults} />,
};

export const DefaultsCityMarket: Story = {
  render: () => (
    <DefaultsSection
      canEdit
      defaults={{
        ...settingsFixtures.defaults,
        city: "Austin, Texas, United States",
        device: "Mobile",
        locationKey: "US/Texas/Austin",
        locationLabel: "Austin, Texas, United States",
      }}
    />
  ),
};

export const ApiKeys: Story = {
  render: () => (
    <ApiKeysSection
      apiKeys={settingsFixtures.apiKeys}
      issueKey={issueStoryKey}
      projectId="prj_7Kd2Qf9m"
    />
  ),
};

export const Notifications: Story = {
  render: () => (
    <NotificationsSection notifications={settingsFixtures.notifications} projectRef="prj_1" />
  ),
};

export const Tags: Story = {
  render: () => (
    <TagsSegments
      createTag={async () => ({ ok: true, value: { created: true } })}
      projectId="prj_7Kd2Qf9m"
      tags={settingsFixtures.tags}
    />
  ),
};

export const ProviderUsageStory: Story = {
  render: () => <ProviderUsage usage={settingsFixtures.usage} />,
};

export const ProviderUsageEmpty: Story = {
  render: () => (
    <ProviderUsage
      usage={{
        budget: { capCents: 5000, spentCents: 0 },
        connections: [],
        serpChecksMonth: "0",
        primaryProvider: "-",
        hasProvider: false,
        onPaceCents: 0,
      }}
    />
  ),
};

export const Team: Story = {
  render: () => <TeamRoles {...manageableTeamProps} members={settingsFixtures.team} />,
};

export const Danger: Story = {
  render: () => (
    <DangerZone
      canDeleteProject
      canManageMigration
      canReadAudit
      direction="to-cloud"
      showInstanceMigration
    />
  ),
};

export const NewWorkspace: Story = {
  render: () => (
    <NewWorkspaceSettings
      apiKeys={[
        {
          createdLabel: "created just now",
          expiresLabel: "expires Oct 24",
          id: "key_dev_1",
          isExpired: false,
          lastUsedLabel: "never used",
          maskedValue: "bsb_key_test_vega_******",
          name: "Development",
        },
      ]}
      canDeleteWorkspace
      canManageWorkspace
      canReadAudit
      data={{
        devKey: {
          createdLabel: "created just now · never used",
          id: "key_dev_1",
          isNew: true,
          maskedValue: "bsb_key_test_vega_8f2c91a4d7e0",
          name: "Development",
        },
        memberCount: 1,
        owner: { email: "demo@acme.dev", initials: "AK", name: "Alex Kim" },
        workspace: { domain: "", name: "Vega Labs", projectId: "prj_7Kd2Qf9m" },
      }}
      issueKey={issueStoryKey}
      billingSection={
        <UsageBillingSection
          email="demo@acme.dev"
          projectId="prj_7Kd2Qf9m"
          submitInterest={async (input) => ({ email: input.email, ok: true })}
          variant="self-host"
        />
      }
      teamSection={<TeamRoles {...manageableTeamProps} members={settingsFixtures.team} />}
    />
  ),
};

export const FullStack: Story = {
  render: () => (
    <div className="flex flex-col gap-[30px]">
      <ProjectDetails canEdit project={settingsFixtures.project} />
      <DefaultsSection canEdit defaults={settingsFixtures.defaults} />
      <ApiKeysSection
        apiKeys={settingsFixtures.apiKeys}
        issueKey={issueStoryKey}
        projectId="prj_7Kd2Qf9m"
      />
      <NotificationsSection notifications={settingsFixtures.notifications} projectRef="prj_1" />
      <TagsSegments
        createTag={async () => ({ ok: true, value: { created: true } })}
        projectId="prj_7Kd2Qf9m"
        tags={settingsFixtures.tags}
      />
      <ProviderUsage usage={settingsFixtures.usage} />
      <TeamRoles {...manageableTeamProps} members={settingsFixtures.team} />
      <DangerZone
        canDeleteProject
        canManageMigration
        canReadAudit
        direction="to-cloud"
        showInstanceMigration
      />
    </div>
  ),
};
