import { Modal } from "@/components/ui/Modal";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/Modal",
  component: Modal,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Modal>;

export default meta;

type Story = StoryObj<typeof meta>;

const footer = (
  <>
    <button className="p-0 text-[13px] font-semibold text-fg-muted" type="button">
      Cancel
    </button>
    <button
      className="rounded-[9px] bg-accent-solid px-4.5 py-[11px] text-[13.5px] font-semibold text-white"
      type="button"
    >
      Export CSV
    </button>
  </>
);

export const Open: Story = {
  args: {
    children: (
      <div className="flex flex-col gap-4.5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            Format
          </div>
          <div className="mt-[9px] flex flex-col gap-[7px]">
            {["CSV", "JSON", "Google Sheet"].map((format) => (
              <button
                className="flex items-center gap-3 rounded-[11px] border border-border bg-bg-elev px-[13px] py-[11px] text-left text-[13.5px] font-semibold text-fg"
                key={format}
                type="button"
              >
                {format}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-[10px] border border-border bg-bg px-[13px] py-[11px] text-[11.5px] leading-[1.45] text-fg-muted">
          Exports honor the current filters and saved view.
        </div>
      </div>
    ),
    footer,
    headerDivider: true,
    onClose: () => undefined,
    open: true,
    size: "md",
    title: "Export keywords",
  },
  render: (args) => (
    <div className="min-h-[560px] bg-bg text-fg">
      <Modal {...args} />
    </div>
  ),
};
