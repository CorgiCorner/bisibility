import type { Meta, StoryObj } from "@storybook/react";
import { MarketChip } from "./MarketChip";

const meta = {
  component: MarketChip,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Markets/MarketChip",
} satisfies Meta<typeof MarketChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {
  args: { languageLabel: "Spanish", locationLabel: "Spain", size: "sm" },
};

export const Medium: Story = {
  args: { languageLabel: "Spanish", locationLabel: "Spain", size: "md" },
};

export const WithDevice: Story = {
  args: { device: "mobile", languageLabel: "Arabic", locationLabel: "Belgium", size: "sm" },
};

/** Same geography, different language: the pair has to stay distinguishable at a glance. */
export const SameGeographyDifferentLanguage: Story = {
  args: { languageLabel: "Dutch", locationLabel: "Belgium" },
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      <MarketChip {...args} />
      <MarketChip {...args} languageLabel="French" />
      <MarketChip {...args} device="desktop" languageLabel="Arabic" />
    </div>
  ),
};

/** Long city pairs truncate inside their budget rather than widening the row. */
export const Truncated: Story = {
  args: {
    className: "max-w-[208px]",
    device: "desktop",
    languageLabel: "Portuguese",
    locationLabel: "Sao Joaquim da Barra, Brazil",
  },
};
