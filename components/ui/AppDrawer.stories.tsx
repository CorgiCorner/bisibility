import { AppDrawer } from "@/components/ui/AppDrawer";
import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";

const meta = {
  title: "UI/AppDrawer",
  component: AppDrawer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppDrawer>;

export default meta;

type Story = StoryObj<typeof meta>;

const content = (
  <div className="flex flex-col gap-4.5">
    <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
      Open, close, then rapidly reopen to verify reversal and content retention.
    </p>
    <div className="flex flex-col gap-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <label className="flex items-center gap-2.5 text-[13px] text-fg" key={`row-${i}`}>
          <input className="accent-accent-solid" type="checkbox" />
          <span>Item {i + 1}</span>
        </label>
      ))}
    </div>
  </div>
);

const footer = (
  <div className="flex items-center justify-end gap-2.5">
    <button
      className="rounded-control border border-border-control bg-bg-elev px-4 py-2.5 text-[13px] font-semibold text-fg-muted"
      type="button"
    >
      Cancel
    </button>
    <button
      className="rounded-control bg-accent-solid px-4 py-2.5 text-[13px] font-semibold text-accent-on-solid"
      type="button"
    >
      Save
    </button>
  </div>
);

function Harness() {
  const [open, setOpen] = useState(false);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  return (
    <div className="min-h-[560px] bg-bg p-6 text-fg">
      <div className="flex items-center gap-3">
        <button
          className="rounded-control bg-accent-solid px-4 py-2.5 text-[13px] font-semibold text-accent-on-solid"
          onClick={() => setOpen(true)}
          type="button"
        >
          Open drawer
        </button>
        <span className="text-[12px] text-fg-muted">
          {closedAt ? `Last onExited: ${closedAt}` : "Not yet exited"}
        </span>
      </div>
      <AppDrawer
        footer={footer}
        onExited={() => setClosedAt(Date.now())}
        onClose={() => setOpen(false)}
        open={open}
        title="Stateful harness"
        description="Verify reversal, Escape close, and content retention."
      >
        {content}
      </AppDrawer>
    </div>
  );
}

export const Interactive: Story = {
  args: {
    children: <span />,
    onClose: () => undefined,
    open: false,
    title: "Stateful harness",
  },
  render: () => <Harness />,
};

function StackedHarness() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("not closed yet");
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <div className="min-h-[560px] bg-bg p-6 text-fg">
      <div className="flex items-center gap-3">
        <button
          className="rounded-control bg-accent-solid px-4 py-2.5 text-[13px] font-semibold text-accent-on-solid"
          onClick={() => setOpen(true)}
          type="button"
        >
          Open panel
        </button>
        <span className="text-[12px] text-fg-muted">Last close reason: {reason}</span>
      </div>
      <AppDrawer
        bodyRef={bodyRef}
        headerLeading={
          <button
            className="flex items-center gap-1.5 border-0 bg-transparent p-0 text-ui-micro uppercase tracking-wider text-fg-muted"
            onClick={() => bodyRef.current?.scrollTo({ top: 0 })}
            type="button"
          >
            Back to the list
          </button>
        }
        onClose={(closeReason) => {
          setReason(closeReason ?? "close button");
          setOpen(false);
        }}
        open={open}
        sheetOnMobile
        title="Second panel of a stack"
      >
        {content}
      </AppDrawer>
    </div>
  );
}

/** The stacked shape: a back control above the title, a bottom sheet under 640px. */
export const Stacked: Story = {
  args: {
    children: <span />,
    onClose: () => undefined,
    open: false,
    title: "Second panel of a stack",
  },
  render: () => <StackedHarness />,
};
