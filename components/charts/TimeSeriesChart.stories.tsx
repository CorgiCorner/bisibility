import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { TimeSeriesChart } from "./TimeSeriesChart";

function withDates(story: ReactNode) {
  return (
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <div className="max-w-xl">{story}</div>
      </DateDisplayProvider>
    </DateFormatProvider>
  );
}

const meta = {
  component: TimeSeriesChart,
  decorators: [(Story) => withDates(<Story />)],
  title: "Charts/TimeSeriesChart",
} satisfies Meta<typeof TimeSeriesChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const dateKeys = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];

export const WithAnnotationMarkers: Story = {
  args: {
    dateKeys,
    height: 220,
    labels: dateKeys,
    markers: [
      { dateKey: "2026-11-02", id: "note", kind: "note", title: "Title change" },
      { dateKey: "2026-11-02", id: "deploy", kind: "deploy", title: "Release" },
      { dateKey: "2026-11-04", id: "content", kind: "content", title: "New guide" },
      { dateKey: "2026-11-05", id: "sitemap", kind: "sitemap", title: "Sitemap refresh" },
      {
        dateKey: "2026-11-01",
        endDateKey: "2026-11-03",
        id: "google",
        kind: "search_engine",
        title: "Core update",
      },
    ],
    series: [
      {
        color: "var(--accent)",
        fill: true,
        label: "Clicks",
        values: [8, 7, 9, 6, 5],
      },
    ],
  },
};
