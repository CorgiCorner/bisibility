import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { Meta, StoryObj } from "@storybook/react";
import { BulkFrequencyForm } from "./BulkActionForms";

const meta = {
  title: "Keywords/Grid/BulkFrequencyForm",
  component: BulkFrequencyForm,
  decorators: [
    (Story) => (
      <div className="bg-bg-elev p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BulkFrequencyForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Form: Story = {
  args: {
    action: async () => undefined,
    onDone: () => undefined,
    onError: () => undefined,
    projectId: "prj_1",
    providerRate: { overrideCents: 1, providerId: "dataforseo" },
    selectedRows: keywordRows.slice(0, 2) as KeywordRow[],
  },
};
