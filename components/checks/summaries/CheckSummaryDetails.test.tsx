import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import checks from "@/messages/core/en/project-rank-tracker.json";
import runs from "@/messages/core/en/project-runs.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckSummaryDetails } from "./CheckSummaryDetails";
import { summaryDetailsFixture } from "./summary-details-fixture";

function show(details = summaryDetailsFixture) {
  return render(
    <FeatureMessagesProvider
      locale="en"
      timeZone="UTC"
      messages={mergeMessageCatalogs(shared, runs, checks)}
    >
      <DateDisplayProvider>
        <CheckSummaryDetails projectRef="prj_story" details={details} timeZone="Europe/Warsaw" />
      </DateDisplayProvider>
    </FeatureMessagesProvider>,
  );
}
describe("UI-5 frozen summary details", () => {
  it("renders every stored group, thresholds, version, links, and collapsed unchanged/new", () => {
    const { container } = show();
    for (const group of ["Down", "Up", "Failed", "Under review"])
      expect(screen.getByRole("heading", { name: `${group} · 1` })).toBeInTheDocument();
    expect(screen.getByText(/Top 10; move of 5/)).toBeInTheDocument();
    expect(screen.getByText(/Summary version 3/)).toBeInTheDocument();
    expect(screen.getByText(/08:00–09:00/).textContent).toContain("08:00–09:00");
    expect(screen.getByRole("link", { name: "Open on runs page" })).toHaveAttribute(
      "href",
      summaryDetailsFixture.runsHref,
    );
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Unchanged / new · 2"));
    expect(screen.getByRole("link", { name: "Keyword 5" })).toBeVisible();
  });
  it("shows plausible directional positions and no result for failed and under-review groups", () => {
    show();
    expect(screen.getByText("18 → 7")).toBeVisible();
    expect(screen.getAllByText("10 → No result")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "1 linked incident" })).toHaveClass("underline");
    expect(screen.getAllByText("Warsaw / Polish / Desktop")).toHaveLength(6);
  });
  it("shows a neutral withdrawal without rows", () => {
    show({ ...summaryDetailsFixture, withdrawn: true });
    expect(screen.getByText("This summary was withdrawn.")).toBeInTheDocument();
    expect(screen.queryByText("Keyword 1")).not.toBeInTheDocument();
  });
  it("retains a deleted check and its announced positions", () => {
    show({
      ...summaryDetailsFixture,
      rows: [{ ...summaryDetailsFixture.rows[0], available: false, keyword: null, market: null }],
    });
    expect(screen.getByText("Unavailable check")).toBeInTheDocument();
    expect(screen.queryByText("kw_story0")).toBeNull();
    expect(screen.getByLabelText("Previous → current")).toHaveTextContent("10 → 15");
  });
});
