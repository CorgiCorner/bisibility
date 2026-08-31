import type { Meta, StoryObj } from "@storybook/react";
import { storyCostContext, storyProjectMarkets } from "./drawer-story-fixtures";
import { TrackQueryDialog } from "./TrackQueryDialog";

const meta = {
  component: TrackQueryDialog,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/Track dialog",
} satisfies Meta<typeof TrackQueryDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = {
  costContext: storyCostContext,
  defaultDevice: "desktop" as const,
  defaultMarketKey: "es-es",
  markets: storyProjectMarkets,
  onCancel: () => undefined,
  onConfirm: () => undefined,
  query: "rank tracking software",
};

export const Open: Story = { args };

/** No provider rate is known, so the money line is dropped rather than printed as zero. */
export const NoRate: Story = {
  args: {
    ...args,
    costContext: { ...storyCostContext, costPerCheckCents: null, providerId: null },
  },
};
