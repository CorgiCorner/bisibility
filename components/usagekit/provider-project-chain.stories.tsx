import type { Meta, StoryObj } from "@storybook/react";
import {
  type ProjectChainProps,
  type ProjectChainSnapshot,
  ProviderChainEditor,
} from "./provider-chain-editor";

function FallbackOrder(props: ProjectChainProps) {
  return <ProviderChainEditor {...props} />;
}

const snapshot: ProjectChainSnapshot = {
  identity: "storybook-project-chain",
  revision: "initial",
  entries: [
    { id: "connection-first", label: "DataForSEO", enabled: true, revision: "first" },
    { id: "connection-second", label: "SerpApi", enabled: true, revision: "second" },
  ],
};

const meta = {
  title: "Integrations/FallbackOrder",
  component: FallbackOrder,
  parameters: { layout: "fullscreen", themeControls: false },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    mode: "project",
    snapshot,
    evidence: snapshot,
    canEdit: true,
    onCommit: async (command) => ({ commandId: command.commandId, outcome: "success" }),
    onReload: async () => snapshot,
    labels: {
      title: "SERP fallback order",
      description: "If a provider fails or is rate-limited, the next active provider is used.",
      first: "First provider",
      next: "",
      disable: "Pause",
      enable: "Activate",
      paused: "Paused",
    },
    formatPosition: (row, index) => (row.enabled && index > 0 ? `Fallback #${index + 1}` : null),
    formatCount: (count) => `${count} active`,
  },
} satisfies Meta<typeof FallbackOrder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editor: Story = {};

const reader = { ...snapshot, identity: "storybook-project-reader" };
export const Reader: Story = {
  args: { snapshot: reader, evidence: reader, canEdit: false, showControls: false },
};

const paused = {
  ...snapshot,
  identity: "storybook-project-paused",
  entries: snapshot.entries.map((entry, index) => ({ ...entry, enabled: index === 0 })),
};
export const Paused: Story = {
  args: { snapshot: paused, evidence: paused, onReload: async () => paused },
};
