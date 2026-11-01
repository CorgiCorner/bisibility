import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import {
  type WorkspaceProjectLimit,
  WorkspaceSwitcher,
} from "@/components/shell/WorkspaceSwitcher";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import shellMessages from "@/messages/core/en/shell.json";
import type { Meta, StoryObj } from "@storybook/react";

const faviconStates = [
  {
    domain: "bisibility.com",
    id: "workspace_bisibility",
    isDefault: false,
    isSample: false,
    keywordCount: 24,
    latestCompletedRankCheckAt: new Date("2026-08-09T10:00:00.000Z"),
    name: "bisibility.com",
    onboardingCompletedAt: new Date("2026-08-01T09:00:00.000Z"),
    plan: "pro",
    publicId: "prj_bisibility",
    role: "owner",
    state: "populated",
    writeMode: "active",
  },
  {
    domain: "no-favicon.example.com",
    id: "workspace_missing",
    isDefault: false,
    isSample: false,
    keywordCount: 8,
    latestCompletedRankCheckAt: null,
    name: "No favicon fallback",
    onboardingCompletedAt: new Date("2026-08-02T09:00:00.000Z"),
    plan: "free",
    publicId: "prj_missing",
    role: "admin",
    state: "no-data",
    writeMode: "active",
  },
] satisfies WorkspaceSummary[];

// Three owned projects: the account is exactly at the hosted project limit.
const atProjectLimit = [
  faviconStates[0],
  { ...faviconStates[1], role: "owner" },
  {
    ...faviconStates[1],
    domain: "supatable.com",
    id: "workspace_supatable",
    keywordCount: 0,
    name: "supatable",
    publicId: "prj_supatable",
    role: "owner",
    state: "empty",
  },
] satisfies WorkspaceSummary[];

const optOutState = {
  domain: "opt-out.example.org",
  id: "workspace_opt_out",
  isDefault: false,
  isSample: false,
  keywordCount: 0,
  latestCompletedRankCheckAt: null,
  name: "Opt-out mode",
  onboardingCompletedAt: new Date("2026-08-03T09:00:00.000Z"),
  plan: "free",
  publicId: "prj_opt_out",
  role: "owner",
  state: "empty",
  writeMode: "active",
} satisfies WorkspaceSummary;

function Frame({
  canCreateWorkspace = false,
  canSetDefault = false,
  projectLimit = null,
  workspaces = faviconStates,
}: {
  canCreateWorkspace?: boolean;
  canSetDefault?: boolean;
  projectLimit?: WorkspaceProjectLimit | null;
  workspaces?: WorkspaceSummary[];
}) {
  return (
    <div className="min-h-[360px] w-[380px] bg-bg p-6 text-fg">
      <WorkspaceSwitcher
        activeProjectId={workspaces[0]?.id ?? ""}
        canCreateWorkspace={canCreateWorkspace}
        canSetDefault={canSetDefault}
        projectLimit={projectLimit}
        variant="boxed"
        workspaces={workspaces}
      />
    </div>
  );
}

const meta = {
  title: "Shell/Workspace switcher",
  component: WorkspaceSwitcher,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale={DEFAULT_LOCALE}
        messages={shellMessages}
        timeZone={DEFAULT_TIME_ZONE}
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    activeProjectId: "workspace_bisibility",
    canCreateWorkspace: false,
    variant: "boxed",
    workspaces: faviconStates,
  },
  parameters: { layout: "centered", nextjs: { appDirectory: true } },
} satisfies Meta<typeof WorkspaceSwitcher>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DomainFaviconStates: Story = {
  name: "Domain favicon states",
  render: () => <Frame />,
};

export const DefaultProjectStar: Story = {
  name: "Default project star",
  render: () => (
    <Frame
      canSetDefault
      workspaces={[faviconStates[0], { ...faviconStates[1], isDefault: true }]}
    />
  ),
};

export const DomainIconsOptedOut: Story = {
  name: "Domain icons opted out",
  render: () => <Frame workspaces={[optOutState]} />,
};

export const ProjectLimitReached: Story = {
  name: "Project limit reached",
  render: () => (
    <Frame
      canCreateWorkspace
      projectLimit={{ canContactSupport: true, limit: 3 }}
      workspaces={atProjectLimit}
    />
  ),
};

export const ProjectLimitReachedSelfHosted: Story = {
  name: "Project limit reached, self-hosted",
  render: () => (
    <Frame
      canCreateWorkspace
      projectLimit={{ canContactSupport: false, limit: 3 }}
      workspaces={atProjectLimit}
    />
  ),
};
