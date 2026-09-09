import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { storyBandList, storyOverlapList, storyQueryDetail } from "./drawer-story-fixtures";
import { DrawerBandRows, DrawerOverlapRows, DrawerSliceRows } from "./SearchInsightsDrawerRows";

const meta = {
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <div className="max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/Drawer tables",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function assertSliceHeaders(canvasElement: HTMLElement, label: string, headers: string[]) {
  const table = within(canvasElement).getByRole("table", { name: label });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent),
  ).toEqual(headers);
}

export const PageSlice: Story = {
  render: () => (
    <DrawerSliceRows
      keyEventsConfigured
      label="Your pages competing for it"
      pageMetricsReadable
      rows={storyQueryDetail.pages.rows.map((row) => ({
        clicks: row.clicks,
        engagementRate: row.engagementRate,
        key: `page:${row.url}`,
        keyEvents: row.keyEvents,
        label: row.path,
        onOpen: () => {},
        position: row.position,
        title: row.url,
      }))}
      seen={new Set()}
      textHeader="Page"
    />
  ),
};

export const PageSliceWithoutMetrics: Story = {
  render: () => (
    <DrawerSliceRows
      keyEventsConfigured
      label="Your page ranking for it"
      pageMetricsReadable={false}
      rows={storyQueryDetail.pages.rows.map((row) => ({
        clicks: row.clicks,
        key: `page:${row.url}`,
        label: row.path,
        onOpen: () => {},
        position: row.position,
        title: row.url,
      }))}
      seen={new Set()}
      textHeader="Page"
    />
  ),
  play: async ({ canvasElement }) => {
    assertSliceHeaders(canvasElement, "Your page ranking for it", ["Page", "Clicks", "Avg pos"]);
  },
};

export const QuerySlice: Story = {
  render: () => (
    <DrawerSliceRows
      keyEventsConfigured={null}
      label="Queries landing here"
      rows={storyQueryDetail.pages.rows.map((row) => ({
        clicks: row.clicks,
        key: `query:${row.path}`,
        label: row.path,
        onOpen: () => {},
        position: row.position,
        title: row.path,
      }))}
      seen={new Set()}
      textHeader="Query"
    />
  ),
  play: async ({ canvasElement }) => {
    assertSliceHeaders(canvasElement, "Queries landing here", ["Query", "Clicks", "Avg pos"]);
  },
};

export const PositionBand: Story = {
  render: () => (
    <DrawerBandRows
      label="Positions 4 to 20"
      onOpen={() => {}}
      rows={storyBandList.rows}
      seen={new Set()}
    />
  ),
};

export const Overlap: Story = {
  render: () => (
    <DrawerOverlapRows
      label="Most clicks first"
      onOpen={() => {}}
      rows={storyOverlapList.rows}
      seen={new Set()}
    />
  ),
};
