import type { RetrievedResults } from "@/lib/checks/contract";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetrievedResultsCompare } from "./RetrievedResultsCompare";

type Full = Extract<RetrievedResults, { tier: "full" }>;
type Compact = Extract<RetrievedResults, { tier: "compact" }>;
type None = Extract<RetrievedResults, { tier: "none" }>;

function fullResults(overrides: Partial<Full> = {}): Full {
  return {
    checkId: "c1",
    checkedAt: "2025-07-01T00:00:00Z",
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    tier: "full",
    requestedDepth: 10,
    retrievedPositions: 10,
    trackedPosition: null,
    stoppedAtResult: false,
    rows: [],
    features: [],
    aiOverview: null,
    fullDetailUntil: null,
    ...overrides,
  };
}

function row(position: number, domain: string) {
  return { position, domain, url: null, title: null, tracked: false };
}

describe("RetrievedResultsCompare", () => {
  it("renders five stats and one row per domain with its chip and tip in the list state", () => {
    const from = fullResults({
      checkId: "c1",
      checkedAt: "2025-07-01T00:00:00Z",
      rows: [
        row(1, "example.com"),
        row(2, "example.org"),
        row(3, "blog.example.com"),
        row(4, "docs.example.org"),
        row(5, "shop.example.com"),
      ],
    });
    const to = fullResults({
      checkId: "c2",
      checkedAt: "2025-07-08T00:00:00Z",
      rows: [
        row(1, "blog.example.com"),
        row(2, "example.com"),
        row(3, "new.example.org"),
        row(4, "example.org"),
        row(5, "shop.example.com"),
      ],
    });

    render(
      <RetrievedResultsCompare
        from={from}
        to={to}
        timeZone="UTC"
        fullCheckDates={["2025-07-01", "2025-07-08"]}
      />,
    );

    expect(screen.getByText("Entered")).toBeInTheDocument();
    expect(screen.getByText("Moved up")).toBeInTheDocument();
    expect(screen.getByText("Moved down")).toBeInTheDocument();
    expect(screen.getByText("Unchanged")).toBeInTheDocument();
    expect(screen.getByText("Dropped out")).toBeInTheDocument();

    expect(screen.getByText("blog.example.com")).toBeInTheDocument();
    expect(screen.getByText("new.example.org")).toBeInTheDocument();
    expect(screen.getByText("docs.example.org")).toBeInTheDocument();

    const enteredChip = screen.getByText("entered");
    expect(enteredChip).toHaveAttribute(
      "title",
      expect.stringContaining("Was not in positions 1-"),
    );
    const upChip = screen.getByText("up 2");
    expect(upChip).toHaveAttribute("title", "Moved up 2 positions.");
    const downChip = screen.getByText("down 2");
    expect(downChip).toHaveAttribute("title", "Moved down 2 positions.");
    const droppedChip = screen.getByText("dropped out");
    expect(droppedChip).toHaveAttribute(
      "title",
      expect.stringContaining("No longer in positions 1-"),
    );
  });

  it("renders the note and no stats in the degenerate state", () => {
    const from = fullResults({
      checkId: "c1",
      checkedAt: "2025-07-01T00:00:00Z",
      rows: [row(1, "example.com")],
      retrievedPositions: 2,
    });
    const to = fullResults({
      checkId: "c2",
      checkedAt: "2025-07-08T00:00:00Z",
      rows: [row(1, "example.com")],
      retrievedPositions: 2,
    });

    render(<RetrievedResultsCompare from={from} to={to} timeZone="UTC" fullCheckDates={[]} />);

    expect(screen.getByText(/overlap over fewer than three positions/)).toBeInTheDocument();
    expect(screen.queryByText("Entered")).not.toBeInTheDocument();
    expect(screen.queryByText("Moved up")).not.toBeInTheDocument();
  });

  it("renders the eyebrow, body and rule and a way-out button that calls onPickFullPair", () => {
    const compact: Compact = {
      checkId: "c1",
      checkedAt: "2025-01-01T00:00:00Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "compact",
      domains: [{ domain: "example.com", bestPosition: 1 }],
      expiredAt: null,
    };
    const to = fullResults({
      checkId: "c2",
      checkedAt: "2025-07-08T00:00:00Z",
      rows: [row(1, "example.com")],
    });
    const onPickFullPair = vi.fn();

    render(
      <RetrievedResultsCompare
        from={compact}
        to={to}
        timeZone="UTC"
        fullCheckDates={["2025-07-01", "2025-07-08"]}
        onPickFullPair={onPickFullPair}
        fullPair={{ from: "c-old", to: "c2" }}
      />,
    );

    expect(screen.getByText("COMPARISON NOT POSSIBLE")).toBeInTheDocument();
    expect(screen.getByText("These two checks cannot be compared")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The earlier check kept only its top 1, so its titles, URLs and page features below that are gone.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Comparison stays available between checks that both hold full detail/),
    ).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Compare 1 Jan with 8 Jul" });
    fireEvent.click(button);
    expect(onPickFullPair).toHaveBeenCalledWith("c-old", "c2");
  });

  it("renders the refused state without a way-out button when fullPair is missing", () => {
    const none: None = {
      checkId: "c1",
      checkedAt: "2025-01-01T00:00:00Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "none",
    };
    const to = fullResults({
      checkId: "c2",
      checkedAt: "2025-07-08T00:00:00Z",
      rows: [row(1, "example.com")],
    });

    render(<RetrievedResultsCompare from={none} to={to} timeZone="UTC" fullCheckDates={[]} />);

    expect(screen.getByText("COMPARISON NOT POSSIBLE")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Compare .+ with .+/ })).not.toBeInTheDocument();
  });

  it("shows a cross-provider notice only when providers differ", () => {
    const from = fullResults({
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      rows: [row(1, "example.com")],
    });
    const sameProvider = fullResults({
      checkId: "c2",
      checkedAt: "2025-07-08T00:00:00Z",
      rows: [row(1, "example.com")],
    });

    const { rerender } = render(
      <RetrievedResultsCompare
        from={from}
        to={sameProvider}
        timeZone="UTC"
        fullCheckDates={["2025-07-01"]}
      />,
    );
    expect(screen.queryByText(/Compared across providers/)).not.toBeInTheDocument();

    const otherProvider = fullResults({
      checkId: "c2",
      checkedAt: "2025-07-08T00:00:00Z",
      provider: "brightlocal",
      providerLabel: "BrightLocal",
      rows: [row(1, "example.com")],
    });
    rerender(
      <RetrievedResultsCompare
        from={from}
        to={otherProvider}
        timeZone="UTC"
        fullCheckDates={["2025-07-01"]}
      />,
    );
    const statsLabel = screen.getByText("Entered");
    const notice = screen.getByText(
      /These checks used different providers: DataForSEO \(1 Jul\) and BrightLocal \(8 Jul\)/,
    );
    const firstRow = screen.getByText("example.com");
    expect(statsLabel.compareDocumentPosition(notice)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(notice.compareDocumentPosition(firstRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
