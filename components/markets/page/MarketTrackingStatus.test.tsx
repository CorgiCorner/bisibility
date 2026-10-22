import { renderWithProjectMarketsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MarketTrackingStatus } from "./MarketTrackingStatus";

it("keeps the status read-only without edit permission", () => {
  const onChange = vi.fn();
  render(<MarketTrackingStatus active canEdit={false} name="US" onChange={onChange} />);
  expect(screen.getByText("Active")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
it("offers resuming a paused market without changing it on opening", () => {
  const onChange = vi.fn();
  render(<MarketTrackingStatus active={false} canEdit name="US" onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "US: Paused" }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: "Resume tracking" }));
  expect(onChange).toHaveBeenCalledWith(true);
});
