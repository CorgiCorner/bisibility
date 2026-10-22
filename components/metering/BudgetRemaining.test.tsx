import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { budgetFixture } from "@/lib/metering/shared-view-fixtures";
import { expect, it } from "vitest";
import { BudgetRemaining } from "./BudgetRemaining";

it("keeps used and reserved extents separate without altering the accounting figures", () => {
  const row = {
    ...budgetFixture("40"),
    reserved: { text: "10", unit: "units", certainty: "measured" as const },
  };
  const before = structuredClone(row);
  const { container } = render(<BudgetRemaining row={row} />);
  const track = container.querySelector<HTMLElement>("[data-usage-track]");
  expect(track?.style.getPropertyValue("--usage-fill")).toBe("40%");
  expect(track?.style.getPropertyValue("--usage-reserved")).toBe("10%");
  expect(row).toEqual(before);
});
it("does not draw a misleading progress bar for unlimited or unknown evidence", () => {
  const { container, rerender } = render(
    <BudgetRemaining row={{ ...budgetFixture(), limit: "unlimited" }} />,
  );
  expect(container.querySelector("[data-usage-track]")).toBeNull();
  rerender(<BudgetRemaining row={{ ...budgetFixture(), reserved: "unavailable" }} />);
  expect(container.querySelector("[data-usage-track]")).toBeNull();
});
