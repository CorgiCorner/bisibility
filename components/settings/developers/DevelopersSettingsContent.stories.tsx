import {
  DevelopersCardsLoading,
  DevelopersLoading,
} from "@/components/settings/developers/DevelopersLoading";
import { DevelopersSettingsContent } from "@/components/settings/developers/DevelopersSettingsContent";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import type { Meta, StoryObj } from "@storybook/react";

const projectId = "prj_story";

const apiKeys = [
  {
    createdLabel: "created Feb 4, 2025",
    expiresLabel: "never expires",
    id: "key_ci",
    isExpired: false,
    lastUsedLabel: "last used 2 hours ago",
    maskedValue: "bsb_key_live_8f3c******a1f2",
    name: "CI deploy checks",
  },
  {
    createdLabel: "created Jun 14, 2026",
    expiresLabel: "expires Sep 12, 2026",
    id: "key_dashboard",
    isExpired: false,
    lastUsedLabel: "last used 3 days ago",
    maskedValue: "bsb_key_live_21a9******77c4",
    name: "Reporting dashboard",
  },
];

const hooks = [
  {
    createdLabel: "created Feb 4, 2025",
    disabled: false,
    id: "dwh_production",
    label: "Production deploys",
    lastUsedLabel: "last used 2 hours ago",
  },
  {
    createdLabel: "created Jun 14, 2026",
    disabled: true,
    id: "dwh_staging",
    label: "Staging deploys",
    lastUsedLabel: "last used May 3, 2026",
  },
];

const actions = {
  createHook: async () => ({
    id: "dwh_new",
    label: "Production deploys",
    maskedValue: "bih_live_example******",
    raw: "bih_live_example",
  }),
  deleteHook: async () => ({ deleted: true }),
  disableHook: async () => ({ disabled: true }),
  issueKey: async () => ({
    maskedValue: "bsb_key_live_example******",
    name: "New key",
    raw: "bsb_key_live_example",
    scope: "write" as const,
  }),
  regenerateKey: async () => ({
    maskedValue: "bsb_key_live_example******",
    name: "Replacement key",
    raw: "bsb_key_live_example",
    scope: "write" as const,
  }),
  revokeKey: async () => ({ revokedAt: new Date(0) }),
  rotateHook: async () => ({
    id: "dwh_rotated",
    label: "Production deploys",
    maskedValue: "bih_live_example******",
    raw: "bih_live_example",
  }),
  sendTestHook: async () => ({
    signalHref: "/app/prj_story/timeline#signal-sig_story",
    signalId: "sig_story",
  }),
};

const meta = {
  component: DevelopersSettingsContent,
  decorators: [
    (Story, context) => (
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        {context.parameters.settingsRouteLoading ? (
          <Story />
        ) : (
          <SettingsShell activeSection="developers" projectRef={projectId}>
            <Story />
          </SettingsShell>
        )}
      </main>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Developers",
} satisfies Meta<typeof DevelopersSettingsContent>;

export default meta;

type Story = StoryObj<typeof meta>;

const commonArgs = {
  ...actions,
  canManage: true,
  docsHref: "/docs/quickstart",
  endpointUrl: "https://example.com/api/ingest/deploy",
  hooks,
  projectId,
};

export const StateWithKeys: Story = {
  args: { ...commonArgs, apiKeys },
  name: "STATE · with keys",
};

export const StateNoKeys: Story = {
  args: { ...commonArgs, apiKeys: [] },
  name: "STATE · no keys",
};

export const Loading: Story = {
  args: { ...commonArgs, apiKeys },
  render: () => <DevelopersCardsLoading />,
};

export const RouteLoading: Story = {
  args: { ...commonArgs, apiKeys },
  name: "Route loading",
  parameters: { settingsRouteLoading: true },
  render: () => <DevelopersLoading />,
};
