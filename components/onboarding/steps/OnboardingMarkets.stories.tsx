import type { Meta, StoryObj } from "@storybook/react";
import { OnboardingMarkets } from "./OnboardingMarkets";

const meta = {
  component: OnboardingMarkets,
  decorators: [
    (Story) => (
      <div className="min-h-[680px] bg-bg p-6 text-fg">
        <div className="mx-auto max-w-[620px]">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Onboarding/Markets",
} satisfies Meta<typeof OnboardingMarkets>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    calculatorHref:
      "/rank-tracking-cost-calculator?keywords=0&locations=1&devices=desktop&frequency=daily&depth=100",
    onChange: () => undefined,
    projectId: "prj_story",
    values: [],
  },
};
