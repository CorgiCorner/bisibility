import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "./Tooltip";

const meta = {
  title: "UI/Tooltip",
  component: Tooltip,
  decorators: [
    (Story) => (
      <div className="flex min-h-[200px] items-center justify-center gap-4 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

const triggerClass = "rounded-lg border border-border px-3 py-2 text-sm";

export const Default: Story = {
  args: {
    content: "Helpful information",
    children: (
      <button className={triggerClass} type="button">
        Hover me
      </button>
    ),
  },
};

export const WarmSequence: Story = {
  args: {
    content: "First tooltip",
    children: (
      <button className={triggerClass} type="button">
        A
      </button>
    ),
  },
  render: () => (
    <>
      <Tooltip content="First tooltip">
        <button className={triggerClass} type="button">
          A
        </button>
      </Tooltip>
      <Tooltip content="Second tooltip">
        <button className={triggerClass} type="button">
          B
        </button>
      </Tooltip>
    </>
  ),
};

export const OverflowHost: Story = {
  args: {
    content: "",
    children: <span />,
  },
  render: () => (
    <div className="overflow-hidden rounded-lg border border-border p-4" style={{ height: 60 }}>
      <Tooltip content="I escape the overflow-hidden container">
        <button className={triggerClass} type="button">
          Hover
        </button>
      </Tooltip>
    </div>
  ),
};

export const KeyboardFocus: Story = {
  args: {
    content: "Press Tab to focus",
    children: (
      <button className={triggerClass} type="button">
        Focus me
      </button>
    ),
  },
};

export const TouchLongPress: Story = {
  args: {
    content: "Touch and hold 700ms to open",
    children: (
      <button className={triggerClass} type="button">
        Touch and hold
      </button>
    ),
  },
  render: () => (
    <>
      <Tooltip content="Warm me first, then long-press the other trigger">
        <button className={triggerClass} type="button">
          Warm
        </button>
      </Tooltip>
      <Tooltip content="Touch and hold 700ms to open">
        <button className={triggerClass} type="button">
          Touch and hold
        </button>
      </Tooltip>
    </>
  ),
};
