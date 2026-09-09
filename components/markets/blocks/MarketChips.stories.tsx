import type { Meta, StoryObj } from "@storybook/react";
import { MarketChips } from "./MarketChips";

const meta = {
  component: MarketChips,
  decorators: [
    (Story) => (
      <div className="max-w-md bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Markets/Blocks/MarketChips",
} satisfies Meta<typeof MarketChips>;

export default meta;
type Story = StoryObj<typeof meta>;

const markets = [
  { id: "pmkt_es", label: "Spain / Spanish", researchAvailable: true, status: "active" as const },
  { id: "pmkt_be", label: "Belgium / Dutch", researchAvailable: false, status: "active" as const },
];

export const Empty: Story = {
  args: { capability: "selection", markets: [], onChange: () => {}, selected: [] },
};

export const Selected: Story = {
  args: { capability: "selection", markets, onChange: () => {}, selected: ["pmkt_es"] },
};

export const NoResearch: Story = {
  args: { capability: "selection", markets, onChange: () => {}, selected: ["pmkt_be"] },
};

export const NewMarket: Story = {
  args: { capability: "selection", markets, onChange: () => {}, onNew: () => {}, selected: [] },
};

export const Scoping: Story = {
  args: { capability: "scoping", markets, onChange: () => {}, selected: ["pmkt_es"] },
};
