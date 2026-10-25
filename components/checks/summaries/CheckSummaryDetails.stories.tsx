import { withEvidenceMessages } from "@/.storybook/evidence-messages";
import { storyTimeZone } from "@/.storybook/story-locale";
import type { Meta, StoryObj } from "@storybook/react";
import { CheckSummaryDetails } from "./CheckSummaryDetails";
import { summaryDetailsFixture } from "./summary-details-fixture";

const meta = {
  title: "Checks/Evidence/SummaryDetails",
  component: CheckSummaryDetails,
  decorators: [withEvidenceMessages],
  render: (args, context) => (
    <CheckSummaryDetails {...args} timeZone={storyTimeZone(context.globals.timeZone)} />
  ),
  args: { details: summaryDetailsFixture, projectRef: "prj_story", timeZone: "Europe/Warsaw" },
} satisfies Meta<typeof CheckSummaryDetails>;
export default meta;
type Story = StoryObj<typeof meta>;
export const EveryGroup: Story = {};
export const CollapsedUnchangedNew: Story = {
  args: { details: { ...summaryDetailsFixture, rows: summaryDetailsFixture.rows.slice(4) } },
};
export const Withdrawn: Story = {
  args: { details: { ...summaryDetailsFixture, withdrawn: true } },
};
export const DeletedCheck: Story = {
  args: {
    details: {
      ...summaryDetailsFixture,
      rows: summaryDetailsFixture.rows.map((row, index) =>
        index === 0 ? { ...row, keyword: null, market: null, available: false } : row,
      ),
    },
  },
};
export const LongLabels: Story = {
  args: {
    details: {
      ...summaryDetailsFixture,
      rows: summaryDetailsFixture.rows.map((row) => ({
        ...row,
        keyword:
          "Bardzo długa fraza do śledzenia pozycji w wyszukiwarce dla konkretnego rynku i urządzenia",
        market: "Województwo zachodniopomorskie, Polska / polski / desktop",
      })),
    },
  },
};
