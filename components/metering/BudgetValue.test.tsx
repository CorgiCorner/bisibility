import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BudgetValue } from "./BudgetValue";

const money = (text: string) => ({ text, unit: "cents", certainty: "measured" as const });
it("keeps used zero visible and muted while reserved zero is a dash", () => {
  const { rerender } = render(<BudgetValue value={money("0")} kind="used" />);
  expect(screen.getByText("$0.00")).toHaveClass("text-fg-muted");
  rerender(<BudgetValue value={money("0")} kind="reserved" />);
  expect(screen.getByText("—")).toHaveClass("text-fg-muted");
});
it("does not represent missing evidence as zero", () => {
  render(<BudgetValue value={{ text: "", unit: "cents", certainty: "unknown" }} kind="used" />);
  expect(screen.getByLabelText("Unknown")).toHaveTextContent("—");
  expect(screen.queryByText("$0.00")).toBeNull();
});
it("shows an over-limit amount without a misleading negative remaining value", () => {
  render(<BudgetValue value={money("-120")} kind="remaining" />);
  expect(screen.getByText("Over by $1.20")).toHaveClass("text-red-text");
});
it("allows only an authorized supplied action to edit an unlimited limit", () => {
  const edit = vi.fn();
  const { rerender } = render(<BudgetValue value="unlimited" kind="limit" />);
  expect(screen.getByText("No limit")).toBeVisible();
  expect(screen.queryByRole("button")).toBeNull();
  rerender(<BudgetValue value="unlimited" kind="limit" onEdit={edit} />);
  fireEvent.click(screen.getByRole("button", { name: "Set limit" }));
  expect(edit).toHaveBeenCalledOnce();
});
it("shows a monthly limit and uses the supplied existing settings link", () => {
  render(
    <BudgetValue
      value={money("1000")}
      kind="limit"
      monthly
      href="/app/prj_one/integrations?tab=usage&budget=edit"
    />,
  );
  expect(screen.getByRole("link", { name: "$10.00 / month" })).toHaveAttribute(
    "href",
    "/app/prj_one/integrations?tab=usage&budget=edit",
  );
});

it.each([
  ["warning", "text-yellow-text"],
  ["exceeded", "text-red-text"],
] as const)("uses the existing %s level for low remaining amounts", (level, tone) => {
  const { rerender } = render(<BudgetValue value={money("120")} kind="remaining" level={level} />);
  expect(screen.getByText("$1.20")).toHaveClass(tone);
  rerender(<BudgetValue value="unavailable" kind="remaining" level={level} />);
  expect(screen.getByLabelText("Unavailable")).toHaveClass("text-fg-muted");
});
