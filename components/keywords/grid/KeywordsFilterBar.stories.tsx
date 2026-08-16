import { toolbarControlClassName } from "@/components/ui";
import type { GridColumnVisibilityModel, GridDensity } from "@mui/x-data-grid";
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
        <div className="rounded-[14px] border border-border bg-bg-elev">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof KeywordsFilterBar>;

export default meta;

type Story = StoryObj<typeof meta>;

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
  const [density, setDensity] = useState<GridDensity>("standard");
  const [columns, setColumns] = useState<GridColumnVisibilityModel>({
    change: true,
    rankingUrl: true,
    sparkline: true,
    tags: true,
    volume: true,
  });

  return (
    <KeywordsFilterBar
      columnVisibilityModel={columns}
      density={density}
      filterChips={[
        { key: "change", label: "Change: Improved" },
        { key: "lastCheck", label: "Last check: Failed" },
        { key: "tags", label: "Tag: branded" },
      ]}
      filterCount={3}
      groupingControl={<ToolbarControl>Group: Tags</ToolbarControl>}
      onClearFilters={() => undefined}
      onColumnVisibilityChange={setColumns}
      onDensityChange={setDensity}
      onOpenExport={() => undefined}
      onOpenFilters={() => undefined}
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
    columnVisibilityModel: {},
    density: "standard",
    filterChips: [],
    filterCount: 0,
    onClearFilters: () => undefined,
    onColumnVisibilityChange: () => undefined,
    onDensityChange: () => undefined,
    onOpenExport: () => undefined,
    onOpenFilters: () => undefined,
    onRemoveFilter: () => undefined,
    onSearchChange: () => undefined,
    searchValue: "",
  },
  render: () => <FilterBarStory />,
};
