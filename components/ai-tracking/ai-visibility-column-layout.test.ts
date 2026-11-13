import { distributeDataTableWidths } from "@/components/ui/data-table/data-table-sizing";
import { expect, it } from "vitest";
import {
  aiVisibilityTableLayouts,
  flexibleAiVisibilityColumn,
} from "./ai-visibility-column-layout";

it("gives each AI Visibility table one flexible column that fills the card", () => {
  expect(flexibleAiVisibilityColumn("brands")).toBe("brand");
  expect(flexibleAiVisibilityColumn("engineChoices")).toBe("engine");
  expect(flexibleAiVisibilityColumn("engines")).toBe("provider");
  expect(flexibleAiVisibilityColumn("prompts")).toBe("prompt");
  expect(flexibleAiVisibilityColumn("sources")).toBe("domain");

  for (const layout of Object.values(aiVisibilityTableLayouts)) {
    const widths = distributeDataTableWidths(
      Object.entries(layout).map(([id, column]) => ({
        flex: "flex" in column ? column.flex : undefined,
        id,
        minSize: "minSize" in column ? column.minSize : undefined,
        size: column.size,
      })),
      1600,
      {},
    );
    expect(Object.values(widths).reduce((total, width) => total + width, 0)).toBe(1600);
  }
});
