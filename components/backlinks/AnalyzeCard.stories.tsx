import type { Meta, StoryObj } from "@storybook/react";
import { fn, userEvent, within } from "storybook/test";
import { AnalyzeCard } from "./AnalyzeCard";
import { EMPTY_BACKLINKS_ESTIMATE } from "./backlinks-workspace-model";

const meta = {
  args: {
    includeSubdomains: true,
    onIncludeSubdomainsChange: fn(),
    onLimitChange: fn(),
    onScopeChange: fn(),
    onSubmit: fn(),
    onTargetChange: fn(),
    resultLimit: 100,
    scope: "site",
  },
  component: AnalyzeCard,
  decorators: [
    (Story) => (
      <div className="min-h-[260px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Backlinks/AnalyzeCard",
} satisfies Meta<typeof AnalyzeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { estimate: EMPTY_BACKLINKS_ESTIMATE, target: "" },
};

export const ValidTarget: Story = {
  args: {
    estimate: { cached: false, costCents: 5, loading: false, valid: true },
    target: "acme-store.com",
  },
};

export const EstimateUnknown: Story = {
  args: {
    estimate: { cached: false, costCents: null, loading: false, valid: true },
    target: "acme-store.com",
  },
};

export const PopoverOpen: Story = {
  args: ValidTarget.args,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "How is this priced?" }),
    );
  },
};
