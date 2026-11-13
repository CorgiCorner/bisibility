import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import type { ChartMarker } from "@/lib/annotations/marker-style";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { ChartMarkerLegend } from "./ChartMarkerLegend";
import { TimeSeriesChart } from "./TimeSeriesChart";

const sample = [
  { dateKey: "2026-11-02", id: "note", kind: "note", title: "Title change" },
  {
    dateKey: "2026-11-02",
    id: "deploy",
    kind: "deploy",
    source: "production",
    title: "Release",
  },
  { dateKey: "2026-11-04", id: "content", kind: "content", title: "New guide" },
] satisfies ChartMarker[];

const denseDays = Array.from({ length: 12 }, (_, index) => {
  const day = String(index + 1).padStart(2, "0");
  return `2026-11-${day}`;
});

const denseKinds = ["note", "deploy", "content", "sitemap", "search_engine"] as const;

const dense = denseDays.map((dateKey, index) => ({
  dateKey,
  id: `marker-${index}`,
  kind: denseKinds[index % denseKinds.length] ?? "note",
  title: `Marker ${index + 1}`,
})) satisfies ChartMarker[];

function withDates(story: ReactNode, className: string) {
  return (
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <div className={className}>{story}</div>
      </DateDisplayProvider>
    </DateFormatProvider>
  );
}

const meta = {
  component: ChartMarkerLegend,
  title: "Charts/ChartMarkerLegend",
} satisfies Meta<typeof ChartMarkerLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { markers: sample, projectRef: "prj_story" },
};

export const OneTypeOff: Story = {
  args: { markers: sample, projectRef: "prj_story_one" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Deploy/ }));
    await expect(canvas.getByRole("button", { name: /Deploy/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  },
};

export const AllOff: Story = {
  args: { markers: sample, projectRef: "prj_story_all" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("switch", { name: "Markers" }));
    await expect(canvas.queryByRole("button", { name: /Deploy/ })).toBeNull();
  },
};

export const DensePins: Story = {
  args: { markers: dense, projectRef: "prj_story_dense" },
  render: (args) =>
    withDates(
      <>
        <TimeSeriesChart
          dateKeys={denseDays}
          height={220}
          labels={denseDays}
          markerProjectRef={args.projectRef}
          markers={args.markers}
          series={[
            {
              color: "var(--accent)",
              fill: true,
              label: "Clicks",
              values: denseDays.map((_, index) => 8 + (index % 4)),
            },
          ]}
        />
        <ChartMarkerLegend {...args} />
      </>,
      "max-w-xl",
    ),
};

export const NarrowCard: Story = {
  args: { markers: sample, projectRef: "prj_story_narrow" },
  render: (args) => withDates(<ChartMarkerLegend {...args} />, "w-64"),
};

export const FocusVisiblePin: Story = {
  ...DensePins,
  play: async ({ canvasElement }) => {
    const pin = within(canvasElement).getAllByRole("link", { name: /Nov .*2026/ })[0];
    if (!pin) throw new Error("Expected a chart marker pin");
    await userEvent.tab();
    pin.focus();
    await expect(pin).toHaveFocus();
    await expect(pin.matches(":focus-visible")).toBe(true);
  },
};
