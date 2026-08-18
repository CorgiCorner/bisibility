import { Sheet } from "@/components/ui/Sheet";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/Sheet",
  component: Sheet,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Sheet>;

export default meta;

type Story = StoryObj<typeof meta>;

const footer = (
  <div className="flex items-center gap-2.5">
    <button
      className="rounded-[9px] border border-border-strong bg-bg-elev px-4 py-2.5 text-[13px] font-semibold text-fg-muted"
      type="button"
    >
      Cancel
    </button>
    <button
      className="flex-1 rounded-[9px] bg-accent-solid px-4 py-2.5 text-[13px] font-semibold text-white"
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
        className="mt-2 min-h-32 w-full resize-y rounded-[10px] border border-border-strong bg-transparent px-[13px] py-3 font-mono text-[13px] leading-[1.7] text-fg outline-none"
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
          className="flex items-center justify-between gap-2 rounded-[9px] border border-border-strong bg-bg-sunken px-3 py-[9px]"
          key={label}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted">
            {label}
          </span>
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

export const FiltersOpen: Story = {
  args: {
    children: (
      <div className="flex flex-col gap-4">
        {["Ranking data", "Keyword attributes", "SERP features", "Tags"].map((label) => (
          <section className="border-b border-border-soft pb-4" key={label}>
            <h3 className="m-0 font-mono text-[11px] uppercase tracking-[0.6px] text-fg-muted">
              {label}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-[7px]">
              <button
                className="rounded-[9px] border border-border-strong bg-bg-elev px-3 py-[9px] text-left text-[12.5px] font-medium text-fg"
                type="button"
              >
                Top 10
              </button>
              <button
                className="rounded-[9px] border border-border-strong bg-bg-elev px-3 py-[9px] text-left text-[12.5px] font-medium text-fg"
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
};
