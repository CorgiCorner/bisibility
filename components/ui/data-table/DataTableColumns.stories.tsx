import type { Meta, StoryObj } from "@storybook/react";
import tableMeta from "./DataTable.stories";
import { DataTableStoryHarness } from "./DataTableStoryHarness";
import { dataTableStoryColumns } from "./data-table-story-fixtures";

const meta = {
  ...tableMeta,
  title: "UI/DataTable/Column boundaries",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const [keyword, position, device, volume, clicks, impressions, ctr, actions] =
  dataTableStoryColumns;
const reorderedColumns = [
  { ...device, meta: { ...device.meta, pin: "left" as const } },
  keyword,
  ctr,
  impressions,
  clicks,
  position,
  { ...volume, meta: { ...volume.meta, pin: "right" as const } },
  actions,
];

export const ReorderedAndRepinned: Story = {
  render: () => (
    <div className="max-w-full" style={{ width: 768 }}>
      <DataTableStoryHarness
        columns={reorderedColumns}
        defaultExpanded="all"
        id="reordered-pins"
        showDensityMenu={false}
      />
    </div>
  ),
};
