import { dataTableCellClassName } from "@/components/ui/data-table/data-table-styles";
import { describe, expect, it } from "vitest";
import {
  settingsTagsActionControlWidth,
  settingsTagsCellPadding,
  settingsTagsColumnBudget,
  settingsTagsColumnSizes,
  settingsTagsColumnsFit,
} from "./SettingsTagsTable";

describe("settings tags columns", () => {
  it("fits the settings column at 1280px and wider without a horizontal scroll", () => {
    const fitted = settingsTagsColumnsFit();
    expect(fitted.sum).toBeLessThanOrEqual(settingsTagsColumnBudget);
    expect(fitted.fits).toBe(true);
    expect(settingsTagsColumnsFit(fitted.sum - 1).fits).toBe(false);
  });

  it("pads the actions cell so the menu button and its border stay inside the card", () => {
    expect(dataTableCellClassName).toContain("px-3");
    expect(settingsTagsColumnSizes.actions).toBeGreaterThanOrEqual(
      settingsTagsCellPadding * 2 + settingsTagsActionControlWidth,
    );
  });
});
