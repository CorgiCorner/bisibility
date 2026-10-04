import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import messages from "@/messages/core/en/project-search-insights.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { storyBandList, storyOverlapList, storyQueryDetail } from "./drawer-story-fixtures";
import { DrawerBandRows, DrawerOverlapRows, DrawerSliceRows } from "./SearchInsightsDrawerRows";

const meta = {
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={mergeMessageCatalogs(sharedMessages, messages)}
      >
        <div className="min-h-screen bg-bg p-6 text-fg">
          <div className="max-w-xl">
            <Story />
          </div>
        </div>
      </FeatureMessagesProvider>
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
      isPageRows
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
      isPageRows
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
    assertRoundedBorder(canvasElement, "Your page ranking for it");
    assertSliceHeaders(canvasElement, "Your page ranking for it", ["Page", "Clicks", "Avg pos"]);
  },
};

export const QuerySlice: Story = {
  render: () => (
    <DrawerSliceRows
      isPageRows={false}
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
    assertRoundedBorder(canvasElement, "Queries landing here");
    assertSliceHeaders(canvasElement, "Queries landing here", ["Query", "Clicks", "Avg pos"]);
  },
};

function assertRoundedBorder(canvasElement: HTMLElement, label: string) {
  const table = within(canvasElement).getByRole("table", { name: label });
  const frame = table.parentElement as HTMLElement;
  expect(parseFloat(getComputedStyle(frame).borderTopWidth)).toBe(0);
  expect(parseFloat(getComputedStyle(table).borderTopLeftRadius)).toBe(
    parseFloat(getComputedStyle(frame).borderTopLeftRadius),
  );
  expect(parseFloat(getComputedStyle(table).borderTopWidth)).toBe(1);
}

export const PositionBand: Story = {
  render: () => (
    <DrawerBandRows
      label="Positions 4 to 20"
      onOpen={() => {}}
      rows={storyBandList.rows}
      seen={new Set()}
    />
  ),
  play: ({ canvasElement }) => assertRoundedBorder(canvasElement, "Positions 4 to 20"),
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
  play: ({ canvasElement }) => assertRoundedBorder(canvasElement, "Most clicks first"),
};
