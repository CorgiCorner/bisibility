import { fixtureTranslate, partialReport } from "@/lib/measurement-help/test-fixtures";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { MeasurementHelp } from "./MeasurementHelp";

const meta = {
  component: MeasurementHelp,
  args: {
    metricId: "organic_visibility_top20",
    definitionVersion: "v1",
    translate: fixtureTranslate,
    formatCount: (value: number) => String(value),
    report: partialReport,
  },
  decorators: [
    (Story) => (
      <div className="bg-bg p-4 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Measurements/Help",
} satisfies Meta<typeof MeasurementHelp>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PartialCoverage: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", {
      name: "Explain: Organic visibility",
    });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole("dialog", { name: "Organic visibility" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(trigger).toHaveFocus();
  },
};
export const FutureVersion: Story = { args: { definitionVersion: "future-v2" } };
export const LoadingContext: Story = { args: { contextState: "loading" } };
export const UnavailableContext: Story = { args: { contextState: "error" } };
export const NoTargets: Story = {
  args: { report: { counts: { expected: 0, measured: 0, freshDeterminate: null } } },
};
export const RetainedStaleObservation: Story = {
  args: {
    report: {
      counts: { expected: 2, measured: 1, stale: 1, failed: 1, freshDeterminate: 0, comparable: 0 },
    },
  },
};
export const AverageAmongRanked: Story = {
  args: { metricId: "average_ranked_position", definitionVersion: "help-v1" },
};
export const NarrowViewport: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
