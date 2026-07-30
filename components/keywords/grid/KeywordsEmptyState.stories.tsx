import type { Meta, StoryObj } from "@storybook/react";
import { KeywordsEmptyState } from "./KeywordsEmptyState";

const meta = {
  title: "Keywords/EmptyState",
  component: KeywordsEmptyState,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KeywordsEmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    canCreateKeyword: true,
    canManageProviders: true,
    importTopQueriesAction: async () => ({
      queries: ["open source rank tracker", "rank tracking for agencies"],
    }),
    onAddKeyword: () => undefined,
    onImportCsv: () => undefined,
    onImportQueries: () => undefined,
    projectId: "prj_7Kd2Qf9m",
  },
};
