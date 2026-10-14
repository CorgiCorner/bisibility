import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RetrievedResultsCard } from "./RetrievedResultsCard";
import { entry, fullResults, OLDER_ID } from "./retrieved-results-test-fixtures";

describe("selected check URL provenance", () => {
  it("shows the retained check URL rather than the tracked raw row or current keyword URL", () => {
    render(
      <RetrievedResultsCard
        entries={[entry()]}
        initialResults={{ ...fullResults(), rankingUrl: "https://example.com/historical" }}
        loadResults={async () => []}
        rankingUrl="https://example.com/current"
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    const summary = screen.getByTestId("retrieved-summary");
    expect(summary).toHaveTextContent("https://example.com/historical");
    expect(summary).not.toHaveTextContent("https://example.com/compare");
    expect(summary).not.toHaveTextContent("https://example.com/current");
  });
  it("does not infer a missing historical URL from a raw tracked row", () => {
    render(
      <RetrievedResultsCard
        entries={[entry()]}
        initialResults={{ ...fullResults(), rankingUrl: null }}
        loadResults={async () => []}
        rankingUrl="https://example.com/current"
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTestId("retrieved-summary")).not.toHaveTextContent("https://");
  });
  it("keeps the older URL when selecting a compact check after raw retention", async () => {
    const older = {
      checkId: OLDER_ID,
      checkedAt: "2026-07-26T06:00:00.000Z",
      tier: "compact" as const,
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      domains: [],
      expiredAt: null,
      rankingUrl: "https://example.com/older",
    };
    render(
      <RetrievedResultsCard
        entries={[
          entry(),
          entry({ checkId: OLDER_ID, checkedAt: older.checkedAt, tier: "compact" }),
        ]}
        initialResults={{ ...fullResults(), rankingUrl: "https://example.com/newer" }}
        loadResults={async () => [older]}
        rankingUrl="https://example.com/current"
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stored checks" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Jul 26, 2026/ }));
    expect(await screen.findByTestId("retrieved-retained-url")).toHaveTextContent(
      "https://example.com/older",
    );
    expect(screen.queryByText("https://example.com/newer")).not.toBeInTheDocument();
  });
});
