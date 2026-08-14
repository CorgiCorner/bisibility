import { countryValueForCode } from "@/components/keywords/location-picker-data";
import type { Meta, StoryObj } from "@storybook/react";
import { MarketPicker } from "./MarketPicker";

const spain = countryValueForCode("ES");
if (!spain) throw new Error("Spain story fixture is missing.");

const meta = {
  component: MarketPicker,
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
  title: "Markets/MarketPicker",
} satisfies Meta<typeof MarketPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Spain: Story = {
  args: {
    calculatorHref: "/pricing#calculator",
    initialLocation: spain,
    maxMarkets: 5,
    onCommit: () => undefined,
    projectId: "prj_story",
    trackedCanonicalKeys: [],
  },
};

export const SpainWithTrackedDefault: Story = {
  args: {
    initialLocation: spain,
    maxMarkets: 5,
    onCommit: () => undefined,
    projectId: "prj_story",
    trackedCanonicalKeys: ["ES"],
  },
};
