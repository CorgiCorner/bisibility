import { Sheet } from "@/components/ui/Sheet";
import { withSharedMessages } from "@/i18n/test-support/shared-messages-story-decorator";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";

const meta = {
  title: "UI/Sheet",
  component: Sheet,
  decorators: [withSharedMessages],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Sheet>;

export default meta;

type Story = StoryObj<typeof meta>;

const footer = (
  <div className="flex items-center gap-2.5">
    <button
      className="rounded-control border border-border-control bg-bg-elev px-4 py-2.5 text-[13px] font-semibold text-fg-muted"
      type="button"
    >
      Cancel
    </button>
    <button
      className="flex-1 rounded-control bg-accent-solid px-4 py-2.5 text-[13px] font-semibold text-accent-on-solid"
      type="button"
    >
      Save changes
    </button>
  </div>
);

const formContent = (
  <div className="flex flex-col gap-5.5">
    <div>
      <label className="text-[12.5px] font-semibold text-fg" htmlFor="keyword-input">
        Keywords
      </label>
      <textarea
        className="mt-2 min-h-32 w-full resize-y rounded-control border border-border-control bg-transparent px-[13px] py-3 text-[13px] leading-[1.7] text-fg outline-none"
        defaultValue={"open source analytics\nself hosted seo tool"}
        id="keyword-input"
      />
      <p className="m-0 mt-[7px] text-[11.5px] text-fg-muted">
        Paste from a spreadsheet, one keyword per line.
      </p>
    </div>
    <div className="grid grid-cols-2 gap-2.5">
      {["Engine", "Country", "Device", "Frequency"].map((label) => (
        <div
          className="flex items-center justify-between gap-2 rounded-control border border-border bg-bg-sunken px-3 py-[9px]"
          key={label}
        >
          <span className="text-[10px] uppercase tracking-[0.4px] text-fg-muted">{label}</span>
          <span className="text-[13px] font-medium text-fg">Google</span>
        </div>
      ))}
    </div>
  </div>
);

export const Open: Story = {
  args: {
    children: formContent,
    footer,
    onClose: () => undefined,
    open: true,
    title: "Add keywords",
  },
  render: (args) => (
    <div className="min-h-[640px] bg-bg text-fg">
      <Sheet {...args} />
    </div>
  ),
};

/** Bottom sheet below `sm` (640px): grab handle, 8px inset, equal footer actions. */
export const Mobile: Story = {
  ...Open,
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Add keywords" });
    if (dialog.getAttribute("data-placement") !== "sheet") return;
    const cancel = page.getByRole("button", { name: "Cancel" });
    const save = page.getByRole("button", { name: "Save changes" });
    const cancelBox = cancel.getBoundingClientRect();
    const saveBox = save.getBoundingClientRect();
    expect(Math.abs(cancelBox.width - saveBox.width)).toBeLessThan(1);
    expect(Math.abs(cancelBox.top - saveBox.top)).toBeLessThan(1);
    expect(save.scrollWidth).toBeLessThanOrEqual(save.clientWidth + 1);
  },
};

export const FiltersOpen: Story = {
  args: {
    children: (
      <div className="flex flex-col gap-4">
        {["Ranking data", "Keyword attributes", "SERP features", "Tags"].map((label) => (
          <section className="border-b border-border pb-4" key={label}>
            <h3 className="m-0 text-[11px] uppercase tracking-[0.6px] text-fg-muted">{label}</h3>
            <div className="mt-3 grid grid-cols-2 gap-[7px]">
              <button
                className="rounded-control border border-border-control bg-bg-elev px-3 py-[9px] text-left text-[12.5px] font-medium text-fg"
                type="button"
              >
                Top 10
              </button>
              <button
                className="rounded-control border border-border-control bg-bg-elev px-3 py-[9px] text-left text-[12.5px] font-medium text-fg"
                type="button"
              >
                Dropped
              </button>
            </div>
          </section>
        ))}
      </div>
    ),
    footer,
    heightVariant: "filters",
    onClose: () => undefined,
    open: true,
    title: "Filters",
    widthVariant: "filters",
  },
  render: Open.render,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const heading = await page.findByRole("heading", { name: "Filters" });
    const icon = page.getByRole("button", { name: "Close sheet" }).querySelector("svg");
    if (!icon) throw new Error("Missing close icon");
    await canvasElement.ownerDocument.fonts.ready;
    const style = getComputedStyle(heading);
    const context = canvasElement.ownerDocument.createElement("canvas").getContext("2d");
    if (!context) throw new Error("Missing font measurement context");
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = context.measureText("H");
    const rect = heading.getBoundingClientRect();
    const baseline =
      rect.top +
      (parseFloat(style.lineHeight) -
        metrics.fontBoundingBoxAscent -
        metrics.fontBoundingBoxDescent) /
        2 +
      metrics.fontBoundingBoxAscent;
    const capCenter = baseline - metrics.actualBoundingBoxAscent / 2;
    const iconRect = icon.getBoundingClientRect();
    expect(Math.abs(iconRect.top + iconRect.height / 2 - capCenter)).toBeLessThan(0.5);
  },
};
