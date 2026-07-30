import type { GridColumnVisibilityModel, GridDensity } from "@mui/x-data-grid";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { KeywordsFilterBar } from "./KeywordsFilterBar";

const meta = {
  title: "Keywords/FilterBar",
  component: KeywordsFilterBar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-[180px] bg-bg p-6 text-fg">
        <div className="rounded-[14px] border border-border bg-bg-elev">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof KeywordsFilterBar>;

export default meta;

type Story = StoryObj<typeof meta>;

function FilterBarStory() {
  const [searchValue, setSearchValue] = useState("");
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
      ]}
      filterCount={2}
      onClearFilters={() => undefined}
      onColumnVisibilityChange={setColumns}
      onDensityChange={setDensity}
      onOpenExport={() => undefined}
      onOpenFilters={() => undefined}
      onRemoveFilter={() => undefined}
      onSearchChange={setSearchValue}
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
