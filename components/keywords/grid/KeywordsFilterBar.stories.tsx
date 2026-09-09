import type {
  DataTableColumn,
  DataTableDensity,
} from "@/components/ui/data-table/data-table-types";
import { toolbarControlClassName } from "@/components/ui/toolbar-control-styles";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { KeywordsFilterBar } from "./KeywordsFilterBar";

const meta = {
  title: "Keywords/FilterBar",
  component: KeywordsFilterBar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-[220px] bg-bg p-6 text-fg">
        <div className="rounded-card border border-border bg-bg-elev">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof KeywordsFilterBar>;

export default meta;

type Story = StoryObj<typeof meta>;

const columns: readonly DataTableColumn<KeywordRow>[] = [
  {
    accessorKey: "keyword",
    header: "Keyword",
    meta: { lockVisible: true, title: "Keyword" },
  },
  { accessorKey: "change", header: "Change", meta: { title: "Change" } },
  { accessorKey: "volume", header: "Volume", meta: { title: "Volume" } },
];

function ToolbarControl({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span
      className={`${toolbarControlClassName} inline-flex items-center gap-1.5 px-[11px] py-[7px]`}
    >
      {children}
    </span>
  );
}

function FilterBarStory() {
  const [searchValue, setSearchValue] = useState("rank tracker");
  const [density, setDensity] = useState<DataTableDensity>("standard");
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    change: true,
    rankingUrl: true,
    sparkline: true,
    tags: true,
    volume: true,
  });

  return (
    <KeywordsFilterBar
      columnSizing={{}}
      columns={columns}
      columnVisibility={columnVisibility}
      density={density}
      filterChips={[
        { key: "change", label: "Change: Improved" },
        { key: "lastCheck", label: "Last check: Failed" },
        { key: "tags", label: "Tag: branded" },
      ]}
      filterCount={3}
      groupingControl={<ToolbarControl>Group: Tags</ToolbarControl>}
      id="filter-bar-story-table"
      onClearFilters={() => undefined}
      onColumnSizingChange={() => undefined}
      onColumnVisibilityChange={setColumnVisibility}
      onDensityChange={setDensity}
      onOpenExport={() => undefined}
      onOpenFilters={() => undefined}
      onRefresh={() => undefined}
      onRemoveFilter={() => undefined}
      onSearchChange={setSearchValue}
      savedViewControl={<ToolbarControl>Default view</ToolbarControl>}
      scopeChip={<span>Scope: example.com</span>}
      scopeControl={<ToolbarControl>All projects</ToolbarControl>}
      searchValue={searchValue}
    />
  );
}

export const Interactive: Story = {
  args: {
    columnSizing: {},
    columns,
    columnVisibility: {},
    density: "standard",
    filterChips: [],
    filterCount: 0,
    id: "filter-bar-story-table",
    onClearFilters: () => undefined,
    onColumnSizingChange: () => undefined,
    onColumnVisibilityChange: () => undefined,
    onDensityChange: () => undefined,
    onOpenExport: () => undefined,
    onOpenFilters: () => undefined,
    onRefresh: () => undefined,
    onRemoveFilter: () => undefined,
    onSearchChange: () => undefined,
    searchValue: "",
  },
  render: () => <FilterBarStory />,
};
