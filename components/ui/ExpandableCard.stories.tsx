import { ExpandableCard } from "@/components/ui/ExpandableCard";
import { withSharedMessages } from "@/i18n/test-support/shared-messages-story-decorator";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, screen, userEvent, within } from "storybook/test";

const meta = {
  title: "UI/ExpandableCard",
  component: ExpandableCard,
  decorators: [withSharedMessages],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ExpandableCard>;

export default meta;

type Story = StoryObj<typeof meta>;

function rows(view: "inline" | "expanded") {
  return (
    <ul
      className="m-0 flex list-none flex-col gap-1.5 px-4 pb-4 pt-1 text-[13px]"
      id={`rows-${view}`}
    >
      {["rank tracking", "seo audit", "keyword research", "backlink checker"].map((label) => (
        <li className="rounded-control border border-border px-3 py-2" key={label}>
          {label}
        </li>
      ))}
    </ul>
  );
}

export const Inline: Story = {
  args: {
    caption: "Stored Search Console rows",
    children: (view) => rows(view),
    title: "Top queries",
  },
  render: (args) => (
    <div className="min-h-[320px] max-w-[420px] bg-bg p-6 text-fg">
      <ExpandableCard {...args} />
    </div>
  ),
};

export const Expanded: Story = {
  ...Inline,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Expand Top queries" }),
    );
    await expect(screen.getByRole("dialog")).toBeVisible();
  },
};
