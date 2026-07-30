import { EmptyState } from "@/components/ui/EmptyState";
import Button from "@mui/material/Button";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/EmptyState",
  component: EmptyState,
  decorators: [
    (Story) => (
      <div className="min-h-[320px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    action: <Button variant="contained">Add keyword</Button>,
    description: "Connect a SERP provider, then add keywords for acme.dev.",
    icon: <MagnifyingGlass size={28} />,
    title: "No keywords tracked yet",
  },
};

export const RichDescription: Story = {
  args: {
    ...Default.args,
    description: (
      <ul className="grid gap-1 text-left">
        <li>Compare related terms</li>
        <li>Review provider metrics</li>
        <li>Add only the keywords you choose</li>
      </ul>
    ),
  },
};

export const WithFootnote: Story = {
  args: {
    ...Default.args,
    footnote: "Activates once you have tracked keywords",
  },
};

export const PositiveTone: Story = {
  args: {
    description: "No alerts have fired in the last 48 hours.",
    icon: <MagnifyingGlass size={27} weight="fill" />,
    title: "All clear",
    tone: "positive",
  },
};
