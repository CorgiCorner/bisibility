import { withSharedMessages } from "@/i18n/test-support/shared-messages-story-decorator";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { DataTableSort } from "./data-table/data-table-types";
import { SortableTableHead } from "./TableSortButton";

const meta = { title: "UI/TableSortButton", decorators: [withSharedMessages] } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function SortableRows() {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const original = ["Pear", "Apple", "Orange"];
  const rows = sorting
    ? [...original].sort((a, b) =>
        sorting.direction === "asc" ? a.localeCompare(b) : b.localeCompare(a),
      )
    : original;
  return (
    <table className="bg-bg text-fg">
      <thead>
        <tr>
          <SortableTableHead
            field="fruit"
            label="Fruit"
            sorting={sorting}
            onSortingChange={setSorting}
          />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row}>
            <td>{row}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const SortingCycle: Story = {
  render: () => <SortableRows />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole("columnheader");
    const button = canvas.getByRole("button");
    const rowNames = () =>
      canvas
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent);
    await expect(header).toHaveAttribute("aria-sort", "none");
    await userEvent.click(button);
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await expect(rowNames()).toEqual(["Apple", "Orange", "Pear"]);
    await userEvent.click(button);
    await expect(header).toHaveAttribute("aria-sort", "descending");
    await expect(rowNames()).toEqual(["Pear", "Orange", "Apple"]);
    await userEvent.click(button);
    await expect(header).toHaveAttribute("aria-sort", "none");
    await expect(rowNames()).toEqual(["Pear", "Apple", "Orange"]);
  },
};
