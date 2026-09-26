import { Button } from "@/components/ui/Button";
import {
  FloatingSelectionBar,
  FloatingSelectionBarSpacer,
} from "@/components/ui/FloatingSelectionBar";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CalendarDotsIcon as CalendarDots } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/dist/csr/LinkSimple";
import { TagIcon as Tag } from "@phosphor-icons/react/dist/csr/Tag";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";

const fewActions = (
  <>
    <Button size="xs" startIcon={<Tag size={15} weight="regular" />} variant="secondary">
      Add tag
    </Button>
    <Button size="xs" startIcon={<LinkSimple size={15} weight="regular" />} variant="secondary">
      Set target URL
    </Button>
    <Button size="xs" startIcon={<Trash size={15} weight="regular" />} variant="destructive">
      Delete
    </Button>
  </>
);

const manyActions = (
  <>
    <Button
      size="xs"
      startIcon={<ArrowsClockwise size={15} weight="regular" />}
      variant="secondary"
    >
      Run checks (Top 100)
    </Button>
    <Button size="xs" startIcon={<Tag size={15} weight="regular" />} variant="secondary">
      Add tag
    </Button>
    <Button size="xs" startIcon={<LinkSimple size={15} weight="regular" />} variant="secondary">
      Set target URL
    </Button>
    <Button size="xs" startIcon={<CalendarDots size={15} weight="regular" />} variant="secondary">
      Set schedule
    </Button>
    <Button size="xs" startIcon={<DownloadSimple size={15} weight="regular" />} variant="secondary">
      Export
    </Button>
    <Button size="xs" startIcon={<Trash size={15} weight="regular" />} variant="destructive">
      Delete
    </Button>
  </>
);

const meta = {
  title: "UI/FloatingSelectionBar",
  component: FloatingSelectionBar,
  args: {
    ariaLabel: "Actions for selected rows",
    children: fewActions,
    clearLabel: "Clear",
    count: 3,
    countLabel: "3 selected",
    onClear: () => undefined,
  },
  decorators: [
    (Story) => (
      <div className="min-h-[320px] bg-bg p-6 text-fg">
        <div className="grid gap-2">
          {["Row one", "Row two", "Row three", "Row four"].map((label) => (
            <div className="rounded-card border border-border bg-bg-elev px-4 py-3" key={label}>
              {label}
            </div>
          ))}
        </div>
        <FloatingSelectionBarSpacer />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FloatingSelectionBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  parameters: { chromatic: { viewports: [1280] } },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole("toolbar", { name: "Actions for selected rows" });
    await expect(within(bar).getByText("3 selected")).toBeVisible();
    await expect(within(bar).getByRole("button", { name: "Clear" })).toBeVisible();
  },
};

export const WithFooter: Story = {
  args: {
    footer: (
      <p className="m-0 font-sans text-[11.5px] tabular-nums text-red-text">
        Could not update keywords. Try again.
      </p>
    ),
  },
};

export const MobileScrollingActions: Story = {
  args: { children: manyActions, count: 12, countLabel: "12 selected" },
  parameters: {
    chromatic: { viewports: [390] },
    viewport: { defaultViewport: "mobile1" },
  },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole("toolbar", { name: "Actions for selected rows" });
    const actions = bar.querySelector<HTMLElement>("[data-floating-selection-actions]");
    await expect(actions).not.toBeNull();
    await expect(actions?.scrollWidth).toBeGreaterThanOrEqual(actions?.clientWidth ?? 0);
  },
};
