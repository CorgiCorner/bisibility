import { composeStory } from "@storybook/react";
import { within } from "@testing-library/dom";
import { useState } from "react";
import { expect, userEvent, waitFor } from "storybook/test";
import { describe, it } from "vitest";
import preview from "../.storybook/preview";
import { type DataTableDensity, DataTableDensityMenu } from "../components/ui";
import meta from "../components/ui/data-table/DataTable.stories";

function DensityMenu({ initialDensity }: { initialDensity: DataTableDensity }) {
  const [density, setDensity] = useState(initialDensity);
  return <DataTableDensityMenu density={density} onDensityChange={setDensity} />;
}

describe("DataTable density menu layout", () => {
  for (const density of ["compact", "standard", "comfortable"] as const) {
    it(`fits every label and selection mark with the ${density} trigger`, async () => {
      const Story = composeStory(
        { render: () => <DensityMenu initialDensity={density} /> },
        meta,
        preview,
      );
      const canvasElement = document.createElement("div");
      document.body.appendChild(canvasElement);
      try {
        await Story.run({ canvasElement });
        const trigger = within(canvasElement).getByRole("button", { name: "Table density" });
        await userEvent.click(trigger);
        const body = within(document.body);
        const menu = await body.findByRole("menu", { name: "Table density" });
        await waitFor(() => {
          const menuBounds = menu.getBoundingClientRect();
          for (const label of ["Compact", "Standard", "Comfortable"]) {
            const item = within(menu).getByRole("menuitem", { name: label });
            const textRange = document.createRange();
            textRange.selectNodeContents(within(item).getByText(label));
            const labelBounds = textRange.getBoundingClientRect();
            const trailing = item.querySelector<HTMLElement>('[data-slot="menu-option-trailing"]');
            expect(trailing).not.toBeNull();
            expect(labelBounds.right + 8).toBeLessThanOrEqual(
              (trailing as HTMLElement).getBoundingClientRect().left,
            );
            expect(labelBounds.right).toBeLessThanOrEqual(menuBounds.right);
          }
        });
        await userEvent.click(within(menu).getByRole("menuitem", { name: "Comfortable" }));
        await waitFor(() => expect(trigger).toHaveTextContent("Comfortable"));
      } finally {
        await Story.load();
        canvasElement.remove();
      }
    });
  }
});
