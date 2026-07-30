import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { LastCheckedCell } from "./LastCheckedCell";

const now = new Date("2026-07-03T12:00:00.000Z");

const meta = {
  title: "Keywords/LastCheckedCell",
  component: LastCheckedCell,
  decorators: [
    (Story) => (
      <div className="min-h-[190px] bg-bg p-6 text-fg">
        <div className="grid max-w-[420px] gap-3 rounded-[14px] border border-border bg-bg-elev p-4">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof LastCheckedCell>;

export default meta;

type Story = StoryObj<typeof meta>;

function Row({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
      <span className="font-mono text-[10.5px] font-semibold uppercase text-fg-faint">{label}</span>
      {children}
    </div>
  );
}

export const Default: Story = {
  args: { lastCheckAt: null, status: null },
  render: () => (
    <>
      <Row label="Fresh">
        <LastCheckedCell lastCheckAt="2026-07-03T09:00:00.000Z" now={now} status="completed" />
      </Row>
      <Row label="Stale">
        <LastCheckedCell lastCheckAt="2026-06-25T12:00:00.000Z" now={now} status="completed" />
      </Row>
      <Row label="Running">
        <LastCheckedCell lastCheckAt="2026-07-03T11:58:00.000Z" now={now} status="running" />
      </Row>
      <Row label="Failed">
        <LastCheckedCell lastCheckAt="2026-07-03T11:00:00.000Z" now={now} status="failed" />
      </Row>
      <Row label="Pending">
        <LastCheckedCell lastCheckAt={null} now={now} status={null} />
      </Row>
    </>
  ),
};
