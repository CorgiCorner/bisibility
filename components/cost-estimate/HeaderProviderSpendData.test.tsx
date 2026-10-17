import { renderWithCostEstimateMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { headerFixture } from "@/lib/metering/shared-view-fixtures";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { HeaderProviderSpendData, HeaderProviderSpendSkeleton } from "./HeaderProviderSpendData";

const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries/workspace-budget-summary", () => ({ loadWorkspaceBudgetSummary: read }));

it("keeps confirmed usage distinct from unavailable after the isolated read finishes", async () => {
  read.mockResolvedValueOnce(headerFixture());
  const ready = await HeaderProviderSpendData({ projectRef: "prj_example" });
  expect(ready.props.summary).toEqual(headerFixture());
  read.mockResolvedValueOnce(null);
  render(await HeaderProviderSpendData({ projectRef: "prj_example" }));
  expect(screen.getByText("Usage unavailable")).toBeVisible();
  expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
});
it("uses the24px header-pill loading geometry without a fabricated usage value", () => {
  render(<HeaderProviderSpendSkeleton />);
  const skeleton = screen.getByTestId("header-budget-loading");
  expect(skeleton).toHaveAttribute("aria-hidden", "true");
  expect(skeleton).toHaveClass("hidden", "md:flex");
  expect(skeleton.firstElementChild).toHaveClass("h-6", "rounded-full", "bg-bg-sunken");
  expect(skeleton).toHaveTextContent("");
});
