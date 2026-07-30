import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { Meta, StoryObj } from "@storybook/react";
import { DataGrid } from "./DataGrid";
import { keywordColumns } from "./grid-columns";

const columns = keywordColumns(
  {
    canDeleteKeyword: true,
    canUpdateKeyword: true,
    onDelete: () => undefined,
    onEdit: () => undefined,
    onRunCheck: () => undefined,
  },
  "prj_story",
);
const rows: KeywordRow[] = keywordRows.slice(0, 5);

const meta = {
  title: "Keywords/DataGrid",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-[420px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Community: Story = {
  render: () => (
    <div className="grid gap-2">
      <DataGrid
        autoHeight
        checkboxSelection
        columns={columns}
        rows={rows}
        sx={{ borderColor: "var(--border)", backgroundColor: "var(--bg-elev)" }}
      />
    </div>
  ),
};
