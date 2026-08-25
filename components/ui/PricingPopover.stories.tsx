import { PricingPopover, pricingTriggerClassName } from "@/components/ui/PricingPopover";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { userEvent, within } from "storybook/test";

type PricingHarnessProps = {
  rows: readonly { label: string; value: string }[];
};

function PricingHarness({ rows }: Readonly<PricingHarnessProps>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        className={pricingTriggerClassName}
        onClick={(event) => setAnchor(event.currentTarget)}
        type="button"
      >
        How is this priced?
      </button>
      <PricingPopover
        anchor={anchor}
        footer={
          <span>
            Charges apply to your own provider account. Cached results are free for 12 hours.
          </span>
        }
        onClose={() => setAnchor(null)}
        rows={rows}
      />
    </>
  );
}

const meta = {
  component: PricingHarness,
  decorators: [
    (Story) => (
      <div className="flex justify-end bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "UI/PricingPopover",
} satisfies Meta<typeof PricingHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

const twoRows = [
  { label: "Profile summary", value: "$0.02" },
  { label: "Repeat within 12 hours", value: "free from cache" },
];

const fourRows = [
  { label: "Profile summary", value: "$0.02" },
  { label: "Monthly history", value: "$0.02" },
  { label: "Link rows", value: "$0.01 / 100" },
  { label: "Repeat within 12 hours", value: "free from cache" },
];

export const TwoRows: Story = {
  args: { rows: twoRows },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "How is this priced?" }),
    );
  },
};

export const FourRows: Story = {
  args: { rows: fourRows },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "How is this priced?" }),
    );
  },
};
