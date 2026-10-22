import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HistoryScope, sameHistoryScope } from "./HistoryScope";
import { observation } from "./history.test-fixture";

it("shows readable scope while keeping technical codes and revisions collapsed", () => {
  render(<HistoryScope scope={observation(0).configuredScope} />);
  expect(screen.getByText("Google · United States · English · Desktop")).toBeVisible();
  const summary = screen.getByText("Technical details");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText(/Target revision: target-v1/)).not.toBeVisible();
  fireEvent.click(summary);
  expect(screen.getByText(/Target revision: target-v1/)).toBeVisible();
});
it("deduplicates identical captured scopes without hiding device or revision changes", () => {
  const scope = observation(0).configuredScope;
  if (!scope) throw new Error("Missing fixture");
  expect(sameHistoryScope(scope, { ...scope })).toBe(true);
  expect(sameHistoryScope(scope, { ...scope, device: "mobile" })).toBe(false);
  expect(sameHistoryScope(scope, { ...scope, targetRevision: "new" })).toBe(false);
});
