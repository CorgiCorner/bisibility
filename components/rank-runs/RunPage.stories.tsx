import type { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "storybook/test";
import { RunPage } from "./RunPage";
import { runPageFixture } from "./RunPageFixtures";

const meta = {
  args: { ...runPageFixture, canMutate: true, projectRef: "prj_example" },
  component: RunPage,
  decorators: [
    (Story, context) => (
      <main
        className="min-h-dvh bg-bg p-4 text-fg lg:p-8"
        data-theme={context.parameters.theme ?? "light"}
      >
        <div className="mx-auto max-w-[1400px]">
          <Story />
        </div>
      </main>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Rank tracker/Run",
} satisfies Meta<typeof RunPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "default" };

export const RunstatePartial: Story = {
  args: {
    run: {
      ...runPageFixture.run,
      costCents: 409,
      counts: { ...runPageFixture.run.counts, completed: 678, deferred: 4, failed: 12 },
      finishedAt: "2026-08-31T14:31:08.000Z",
      outcome: "partial",
      status: "completed",
    },
  },
  name: "runstate-partial",
};

export const RunstateSucceeded: Story = {
  args: {
    run: {
      ...runPageFixture.run,
      costCents: 416,
      counts: { ...runPageFixture.run.counts, completed: 694, failed: 0 },
      finishedAt: "2026-08-31T14:30:26.000Z",
      outcome: "succeeded",
      status: "completed",
    },
  },
  name: "runstate-succeeded",
};

export const ThemeDark: Story = { name: "theme-dark", parameters: { theme: "dark" } };

export const DialogCancelRun: Story = {
  name: "dialog-cancel-run",
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Cancel run" }));
  },
};

export const ItemsSkippedFilter: Story = {
  name: "items-skipped-filter",
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "6 skipped before start" }),
    );
  },
};

export const RunstatePlanned: Story = {
  args: {
    run: {
      ...runPageFixture.run,
      costCents: 0,
      counts: { ...runPageFixture.run.counts, completed: 0, failed: 0, total: 694 },
      launchedAt: null,
      plannedFor: "2026-09-01T06:00:00.000Z",
      requestedBy: null,
      status: "planned",
      trigger: "scheduled",
    },
  },
  name: "runstate-planned",
};
