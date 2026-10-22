import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CompetitorSnapshotCard } from "./CompetitorSnapshotCard";
import { CHECK_ID, entry, fullResults } from "./retrieved-results-test-fixtures";

const props = {
  competitors: [{ publicId: "cmp_rival", domain: "rival.test", label: "Rival" }],
  ownDomain: "example.com",
  entries: [entry()],
  selected: CHECK_ID,
  onSelect: vi.fn(),
  formatDate: (value: string) => value,
  formatDateTime: (value: string) => value,
  error: null,
};
it("keeps the selected-date picker while stored results are loading or fail", () => {
  const { rerender } = render(<CompetitorSnapshotCard {...props} results={null} />);
  expect(screen.getByRole("button", { name: "Competitor check" })).toBeVisible();
  expect(screen.getByText("Loading stored results...")).toBeVisible();
  expect(screen.queryByRole("table")).toBeNull();
  rerender(
    <CompetitorSnapshotCard
      {...props}
      results={null}
      error="Stored results could not be loaded. Try again."
    />,
  );
  expect(screen.getByText("Stored results could not be loaded. Try again.")).toBeVisible();
  expect(screen.queryByRole("table")).toBeNull();
});
it("does not call a missing retained result an absent competitor", () => {
  render(
    <CompetitorSnapshotCard
      {...props}
      results={{
        checkId: CHECK_ID,
        checkedAt: entry().checkedAt,
        provider: "dataforseo",
        providerLabel: "DataForSEO",
        tier: "none",
      }}
    />,
  );
  expect(screen.getByText("No stored results for this check")).toBeVisible();
  expect(screen.queryByText("Not in saved results")).toBeNull();
});
it("does not add an empty card when the project has no competitors", () => {
  const { container } = render(
    <CompetitorSnapshotCard {...props} competitors={[]} results={fullResults()} />,
  );
  expect(container).toBeEmptyDOMElement();
});
