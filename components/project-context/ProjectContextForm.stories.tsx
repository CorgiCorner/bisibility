import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { emptyProjectContext } from "@/lib/project-context/model";
import messages from "@/messages/core/en/agent-workspace.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { ProjectContextForm } from "./ProjectContextForm";
import { ProjectContextLoading } from "./ProjectContextLayout";

const meta = {
  component: ProjectContextForm,
  title: "Agent workspace/Project context",
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...messages }}
        timeZone="UTC"
      >
        <div className="max-w-settings">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    context: emptyProjectContext,
    canEdit: true,
    saveAction: async () => emptyProjectContext,
  },
  parameters: { layout: "padded", chromatic: { viewports: [390, 1440] } },
} satisfies Meta<typeof ProjectContextForm>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Loading: Story = { render: () => <ProjectContextLoading /> };
export const Saved: Story = {
  args: {
    context: {
      ...emptyProjectContext,
      business: "Acme builds software that helps independent shops manage stock.",
      audience: "Small retail teams with limited technical support.",
      products: "Inventory tracking and purchase forecasting.",
      goals: "Grow qualified organic traffic for inventory planning queries.",
      agentRules: "Use specific evidence. Distinguish real observations from synthetic tests.",
    },
  },
};
export const ReadOnly: Story = { args: { canEdit: false } };
