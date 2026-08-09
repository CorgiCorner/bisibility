import { ApiKeysSection } from "@/components/settings/api-keys/ApiKeysSection";
import { UsageBillingSection } from "@/components/settings/billing/UsageBillingSection";
import { DangerZone } from "@/components/settings/danger/DangerZone";
import { DefaultsSection } from "@/components/settings/defaults/DefaultsSection";
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

/** An empty workspace has no domain yet; the field must invite input, not look filled. */
export const ProjectWithoutDomain: Story = {
  render: () => <ProjectDetails canEdit project={{ ...settingsFixtures.project, domain: "" }} />,
};

/** A hosted instance-import workspace stores a generated host - shown as context only. */
export const ProjectWithGeneratedHost: Story = {
  render: () => (
    <ProjectDetails
      canEdit
      project={{ ...settingsFixtures.project, domain: "workspace-8abefb1f.bisibility.cloud" }}
    />
  ),
};

export const Billing: Story = {
  render: () => (
    <UsageBillingSection
      email="demo@acme.dev"
      projectId="prj_7Kd2Qf9m"
      submitInterest={async (input) => ({ email: input.email, ok: true })}
      variant="self-host"
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
