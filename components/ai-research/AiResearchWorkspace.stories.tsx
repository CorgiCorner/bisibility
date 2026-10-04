import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Observed, Synthetic } from "./AiResearchResults.stories";
import { AiResearchWorkspace } from "./AiResearchWorkspace";

const meta = {
  title: "Research/AI Workspace",
  component: AiResearchWorkspace,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={{ ...sharedMessages, ...aiMessages }}
      >
        <div className="min-h-screen bg-bg p-5 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
  args: {
    projectId: "prj_example",
    domain: "acme.example",
    mode: "visibility",
    history: [
      { id: "agr_example", title: "AI visibility: Acme", createdAt: "2026-10-02T12:00:00Z" },
    ],
    analyzeAction: async () => ({
      ok: true,
      estimate: true,
      evidence: "observed_dataset",
      estimatedCostCents: 11,
    }),
  },
} satisfies Meta<typeof AiResearchWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Visibility: Story = {
  args: {
    initialOutcome: {
      ok: true,
      estimate: false,
      cached: false,
      reportId: "agr_example",
      costCents: 10.1,
      result: Observed.args.result,
    },
  },
};
export const PromptExplorer: Story = {
  args: {
    mode: "prompt",
    history: [
      { id: "agr_example", title: "Prompt comparison: Acme", createdAt: "2026-10-02T12:00:00Z" },
    ],
    initialOutcome: {
      ok: true,
      estimate: false,
      cached: false,
      reportId: "agr_example",
      costCents: 0.11,
      result: Synthetic.args.result,
    },
  },
};
export const ReadOnly: Story = { args: { canRun: false } };
export const Empty: Story = { args: { history: [] } };
