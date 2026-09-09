import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react";
import { DataTableStoryHarness } from "./DataTableStoryHarness";
import {
  clientPaginationStoryRows,
  dataTableStoryRows,
  fixedResizeStoryColumns,
  stableSortStoryRows,
} from "./data-table-story-fixtures";
import {
  playColumnVisibility,
  playFillLayout,
  playPersistedLayout,
  playPinnedScroll,
  playResponsiveWidths,
  playVirtualPerformance,
} from "./data-table-story-layout-plays";
import { DataTablePerformanceStory } from "./data-table-story-performance";
import {
  playClientPagination,
  playDensity,
  playDensityMenu,
  playEmptyAndPending,
  playGroupingAndSelection,
  playPagination,
  playPending,
  playSections,
  playServerSorting,
  playStableClientSorting,
} from "./data-table-story-plays";
import { playColumnResize, playKeyboardResize } from "./data-table-story-resize-plays";
import { DataTableResponsiveStory } from "./data-table-story-responsive";

const meta = {
  decorators: [
    (Story) => (
      <div className="min-h-screen min-w-0 overflow-x-hidden bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
  title: "UI/DataTable/Complete contract",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ServerSorting: Story = {
  play: playServerSorting,
  render: () => (
    <DataTableStoryHarness
      id="sort-server"
      rows={dataTableStoryRows}
      showColumnsMenu={false}
      showDensityMenu={false}
      sortingMode="server"
    />
  ),
};

export const StableClientSorting: Story = {
  play: playStableClientSorting,
  render: () => (
    <DataTableStoryHarness
      id="sort-client"
      rows={stableSortStoryRows}
      showColumnsMenu={false}
      showDensityMenu={false}
      sortingMode="client"
    />
  ),
};

export const ColumnVisibility: Story = {
  play: playColumnVisibility,
  render: () => <DataTableStoryHarness id="visibility" />,
};

export const PersistedColumnLayout: Story = {
  loaders: [
    () => {
      const key = "bv:data-table:persisted-layout:v1";
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(
          key,
          JSON.stringify({ columnSizing: { device: 144 }, columnVisibility: { device: false } }),
        );
      }
      return {};
    },
  ],
  play: playPersistedLayout,
  render: () => (
    <DataTableStoryHarness id="persisted-layout" showDensityMenu={false} showRemountControl />
  ),
};

export const PointerResizing: Story = {
  play: playColumnResize,
  render: () => (
    <div className="w-[900px] max-w-full min-w-0">
      <DataTableStoryHarness
        columns={fixedResizeStoryColumns}
        id="resize"
        showColumnsMenu={false}
        showDensityMenu={false}
      />
    </div>
  ),
};

export const KeyboardResizing: Story = {
  play: playKeyboardResize,
  render: () => (
    <DataTableStoryHarness id="resize-keyboard" showColumnsMenu={false} showDensityMenu={false} />
  ),
};

export const PinnedHorizontalScroll: Story = {
  play: playPinnedScroll,
  render: () => (
    <div className="w-[520px] max-w-full min-w-0">
      <DataTableStoryHarness
        defaultExpanded="all"
        id="pinned-scroll"
        showColumnsMenu={false}
        showDensityMenu={false}
      />
    </div>
  ),
};

export const GroupingExpansionAndSelection: Story = {
  play: playGroupingAndSelection,
  render: () => (
    <DataTableStoryHarness
      id="grouping-selection"
      showColumnsMenu={false}
      showDensityMenu={false}
    />
  ),
};

export const AutoLayoutWithSections: Story = {
  play: playSections,
  render: () => (
    <DataTableStoryHarness
      id="auto-sections"
      pagination={null}
      showColumnsMenu={false}
      showDensityMenu={false}
    />
  ),
};

export const FillLayoutWithStickyFooter: Story = {
  play: playFillLayout,
  render: () => (
    <DataTableStoryHarness
      defaultExpanded="all"
      id="fill-layout"
      layout="fill"
      pagination={{ page: 1, pageSize: 10, pageSizeOptions: [10, 25, 50], rowCount: 1_240 }}
      showColumnsMenu={false}
      showDensityMenu={false}
    />
  ),
};

export const ServerPagination: Story = {
  play: playPagination,
  render: () => (
    <DataTableStoryHarness
      id="pagination"
      pagination={{ page: 1, pageSize: 10, pageSizeOptions: [10, 25, 50], rowCount: 1_240 }}
      showColumnsMenu={false}
      showDensityMenu={false}
    />
  ),
};

export const ClientPagination: Story = {
  play: playClientPagination,
  render: () => (
    <DataTableStoryHarness
      id="client-pagination"
      pagination={{ page: 1, pageSize: 10, pageSizeOptions: [10, 25], rowCount: 999 }}
      paginationMode="client"
      rows={clientPaginationStoryRows}
      showColumnsMenu={false}
      showDensityMenu={false}
    />
  ),
};

export const CompactDensity: Story = {
  play: (context) => playDensity(context, "density-compact", 56),
  render: () => (
    <DataTableStoryHarness
      density="compact"
      id="density-compact"
      showColumnsMenu={false}
      showDensityMenu={false}
    />
  ),
};

export const StandardDensity: Story = {
  play: playDensityMenu,
  render: () => <DataTableStoryHarness id="density-standard" showColumnsMenu={false} />,
};

export const ComfortableDensity: Story = {
  play: (context) => playDensity(context, "density-comfortable", 78),
  render: () => (
    <DataTableStoryHarness
      density="comfortable"
      id="density-comfortable"
      showColumnsMenu={false}
      showDensityMenu={false}
    />
  ),
};

export const Empty: Story = {
  play: playEmptyAndPending,
  render: () => (
    <DataTableStoryHarness
      emptyState={
        <EmptyState
          action={<Button variant="secondary">Add keywords</Button>}
          description="Add keywords to start tracking their rankings."
          icon={<MagnifyingGlassIcon size={22} weight="regular" />}
          title="No tracked phrases yet"
        />
      }
      id="empty"
      rows={[]}
      showColumnsMenu={false}
      showDensityMenu={false}
    />
  ),
};

export const Pending: Story = {
  play: playPending,
  render: () => (
    <DataTableStoryHarness id="pending" pending showColumnsMenu={false} showDensityMenu={false} />
  ),
};

export const ResponsiveWidths: Story = {
  play: playResponsiveWidths,
  render: () => <DataTableResponsiveStory />,
};

export const TenThousandLeaves: Story = {
  play: playVirtualPerformance,
  render: () => <DataTablePerformanceStory />,
};
