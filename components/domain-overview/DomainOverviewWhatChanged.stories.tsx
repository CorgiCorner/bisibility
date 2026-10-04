import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { domainOverviewFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { DomainOverviewWhatChanged } from "./DomainOverviewWhatChanged";
import { domainOverviewReportFixture } from "./fixtures";

const metrics = domainOverviewReportFixture.overview;
if (!metrics) throw new Error("Expected the overview metrics fixture");

const meta = {
  component: DomainOverviewWhatChanged,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={domainOverviewFeatureTestMessages}
        timeZone="UTC"
      >
        <div className="max-w-[420px] bg-bg p-4 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Domain Overview/Ranking Changes",
} satisfies Meta<typeof DomainOverviewWhatChanged>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Movements: Story = {
  args: {
    dateFormat: "month_first",
    metrics,
    sourceSnapshotAt: "2026-09-19T00:00:00.000Z",
  },
};

export const ZeroMovement: Story = {
  args: {
    ...Movements.args,
    metrics: { ...metrics, isLost: 0 },
  },
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByText("Lost").closest("li");
    const fill = row?.lastElementChild?.firstElementChild;
    if (!(fill instanceof HTMLElement)) throw new Error("Expected the movement bar fill");
    await expect(fill.getBoundingClientRect().width).toBe(0);
  },
};
