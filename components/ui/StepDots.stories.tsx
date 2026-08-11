import { StepDots } from "@/components/ui/StepDots";
import type { Meta, StoryObj } from "@storybook/react";

const themes = ["light", "dark"] as const;

const meta = {
  component: StepDots,
  decorators: [
    (Story) => (
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {themes.map((theme) => (
          <section className="rounded-[14px] bg-bg p-5 text-fg" data-theme={theme} key={theme}>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
              {theme} theme
            </p>
            <Story />
          </section>
        ))}
      </div>
    ),
  ],
  title: "UI/StepDots",
} satisfies Meta<typeof StepDots>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Compact: Story = {
  args: { currentIndex: 1, items: [1, 2, 3] },
  render: () => (
    <StepDots
      className="flex items-center gap-2.5"
      currentIndex={1}
      items={[1, 2, 3]}
      label={
        <span className="font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
          Step 2 of 3
        </span>
      }
    />
  ),
};
