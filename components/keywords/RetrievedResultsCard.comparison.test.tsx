import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { RetrievedResults } from "@/lib/checks/contract";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetrievedResultsCard } from "./RetrievedResultsCard";
import {
  entry,
  fullResults,
  OLDER_ID,
  renderCard,
  screenshotRows,
} from "./retrieved-results-test-fixtures";

describe("RetrievedResultsCard comparison", () => {
  it("loads the second check only when comparison is entered", async () => {
    const { loadResults } = renderCard(
      [entry(), entry({ checkId: OLDER_ID, checkedAt: "2026-07-26T06:00:00.000Z", position: 26 })],
      fullResults(),
    );
    expect(loadResults).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));

    await waitFor(() => expect(loadResults).toHaveBeenCalledWith([OLDER_ID]));
  });

  it("matches the one-check screenshot contract and jumps to the tracked result", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderCard(
      [entry({ checkedAt: "2026-03-12T06:00:00.000Z", position: 4, retrievedPositions: 8 })],
      fullResults({
        checkedAt: "2026-03-12T06:00:00.000Z",
        features: ["answer box", "related questions", "sitelinks", "video"],
        requestedDepth: 100,
        retrievedPositions: 8,
        rows: screenshotRows(),
        trackedPosition: 4,
      }),
    );

    expect(screen.getByRole("heading", { name: "SERP snapshot" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "What Google returned around your result, kept from the moment each check ran.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop comparing" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stored checks" })).toHaveTextContent(
      "Mar 12, 2026, 06:00 · top 8 kept",
    );
    expect(screen.getByText("7 results saved · requested Top 100")).toBeInTheDocument();

    const features = screen.getByTestId("retrieved-features");
    expect(features).toHaveClass("flex", "flex-wrap");
    const featureLabels = ["Featured snippet", "People also ask", "Sitelinks", "Video"];
    const featureNodes = featureLabels.map((label) => within(features).getByText(label));
    for (let index = 1; index < featureNodes.length; index++) {
      expect(featureNodes[index - 1]?.compareDocumentPosition(featureNodes[index] as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    const summary = screen.getByTestId("retrieved-summary");
    expect(summary).toHaveTextContent("Your result#4");
    expect(summary).toHaveTextContent("7 results saved · requested Top 100");
    expect(summary).toHaveTextContent("/compare");
    expect(summary).not.toHaveClass("bg-bg-sunken");
    expect(screen.getByText("Headless CMS for product teams - Acme")).toBeInTheDocument();
    expect(screen.getByText("Your site")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Jump to your result" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(
      screen.getByText("Full detail is kept for 90 days on hosted workspaces."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Retrieved results")).toHaveClass(
      "max-h-[420px]",
      "overflow-y-auto",
    );
  });

  it("renders the compare header controls in screenshot order with neutral selected state", async () => {
    const older = fullResults({
      checkId: OLDER_ID,
      checkedAt: "2026-03-05T06:00:00.000Z",
      provider: "serpapi",
      providerLabel: "SerpApi",
      retrievedPositions: 8,
      rows: screenshotRows(),
      trackedPosition: 6,
    });
    const current = fullResults({
      checkedAt: "2026-03-12T06:00:00.000Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      retrievedPositions: 8,
      rows: screenshotRows(),
      trackedPosition: 4,
    });
    const loadResults = vi.fn(async () => [older]);
    render(
      <RetrievedResultsCard
        entries={[
          entry({ checkedAt: current.checkedAt, position: 4, retrievedPositions: 8 }),
          entry({
            checkId: OLDER_ID,
            checkedAt: older.checkedAt,
            position: 6,
            provider: "serpapi",
            providerLabel: "SerpApi",
            retrievedPositions: 8,
          }),
        ]}
        initialResults={current}
        loadResults={loadResults}
        rankingUrl="/headless-cms"
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    await screen.findByRole("heading", { name: "SERP snapshots" });

    const header = screen.getByTestId("retrieved-header");
    expect(within(header).getByText("From")).toBeVisible();
    expect(within(header).getByText("To")).toBeVisible();
    expect(within(header).getByRole("button", { name: "Earlier check" })).toHaveTextContent(
      "Mar 5, 2026, 06:00 · top 8 kept",
    );
    expect(within(header).getByRole("button", { name: "Later check" })).toHaveTextContent(
      "Mar 12, 2026, 06:00 · top 8 kept",
    );
    expect(screen.getByRole("button", { name: "Stop comparing" })).toBeVisible();
    expect(within(header).getByRole("button", { name: "Earlier check" })).toHaveClass(
      "min-h-[34px]",
    );
    expect(within(header).getByRole("button", { name: "Later check" })).toHaveClass("min-h-[34px]");
  });

  it("uses one outer card outline without an enclosing header border", () => {
    renderCard([entry()], fullResults());
    const card = screen.getByTestId("retrieved-results-card");
    expect(card).toHaveAttribute("data-slot", "card");
    expect(card.querySelectorAll("[data-slot='card']")).toHaveLength(0);
    const header = screen.getByTestId("retrieved-header");
    expect(header).toHaveClass("border-b");
    expect(header).not.toHaveClass("border", "rounded-card");
  });

  it("disables comparison when fewer than two retained checks exist", () => {
    const single = renderCard([entry()], fullResults());
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    fireEvent.click(compare);
    expect(single.loadResults).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "SERP snapshot" })).toBeInTheDocument();
  });

  it("ignores purged history when deciding whether comparison is available", () => {
    const { loadResults } = renderCard(
      [entry(), entry({ checkId: OLDER_ID, tier: "none", retrievedPositions: null })],
      fullResults(),
    );
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    fireEvent.click(compare);
    expect(loadResults).not.toHaveBeenCalled();
  });

  it("allows full and compact history to enter comparison and show refusal", async () => {
    const compact: RetrievedResults = {
      checkId: OLDER_ID,
      checkedAt: "2026-01-04T06:00:00Z",
      domains: [{ bestPosition: 3, domain: "example.org" }],
      expiredAt: null,
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "compact",
    };
    render(
      <RetrievedResultsCard
        entries={[
          entry(),
          entry({
            checkId: OLDER_ID,
            checkedAt: compact.checkedAt,
            retrievedPositions: 3,
            tier: "compact",
          }),
        ]}
        initialResults={fullResults()}
        loadResults={async () => [compact]}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    const body = screen.getByTestId("retrieved-results-body");
    const pickers = screen.getByTestId("retrieved-picker-slots");
    expect(body).toHaveClass("h-[480px]", "sm:h-[520px]", "overflow-y-auto");
    expect(pickers).toHaveClass("flex", "flex-wrap", "sm:justify-end");
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeEnabled();
    fireEvent.click(compare);
    expect(await screen.findByText("These two checks cannot be compared")).toBeInTheDocument();
    expect(screen.getByTestId("retrieved-results-body")).toBe(body);
    expect(screen.getByTestId("retrieved-picker-slots")).toBe(pickers);
    expect(
      screen.getByText(
        "The earlier check kept only its top 3, so its titles, URLs and page features below that are gone.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop comparing" }));
    expect(screen.getByTestId("retrieved-results-body")).toBe(body);
    expect(body).toHaveClass("h-[480px]", "sm:h-[520px]");
  });
});
