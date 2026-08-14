import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";

describe("KeywordDetailHeaderChrome", () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("uses the calibrated compact ID chip", () => {
    render(<KeywordDetailHeaderChrome actions={null} keyword={keywordRows[0]} timeZone="UTC" />);

    const id = screen.getByText(keywordRows[0].id);
    const chip = id.parentElement;
    const copyButton = screen.getByRole("button", { name: "Copy ID" });

    expect(id).toHaveClass("text-[11px]", "leading-normal");
    expect(chip).toHaveClass("h-[22px]", "gap-[5px]", "rounded-[7px]", "px-2", "py-[3px]");
    expect(copyButton).toHaveClass("min-h-3", "min-w-3", "p-0");
    expect(copyButton).toHaveStyle({ minHeight: "12px", minWidth: "12px", padding: "0px" });
    expect(copyButton.querySelector("svg")).toHaveAttribute("width", "12");
  });

  it.each(["failed", "running"] as const)(
    "does not expose a stale ranking URL after a %s check",
    (rankState) => {
      render(
        <KeywordDetailHeaderChrome
          actions={null}
          keyword={{
            ...keywordRows[0],
            rankingUrl: "https://example.com/headless-cms",
            rankingUrlHistory: [
              {
                endAt: "2026-08-09T10:00:00.000Z",
                isCurrent: true,
                note: "Current",
                position: 3,
                requestedDepth: 20,
                startAt: "2026-08-09T10:00:00.000Z",
                url: "https://example.com/headless-cms",
              },
            ],
            targetUrl: "/preferred",
          }}
          rankState={rankState}
          timeZone="UTC"
        />,
      );

      const metadata = screen.getByLabelText("Keyword check metadata");
      expect(metadata).toHaveTextContent("Ranking No ranking URL yet");
      expect(metadata).not.toHaveTextContent("/headless-cms");
    },
  );

  it("keeps topic and intent labels while filtering their duplicate tags", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{
          ...keywordRows[0],
          intent: "commercial",
          tags: ["Product", "commercial", "Priority"],
          topic: "Product",
        }}
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("Topic: Product")).toBeInTheDocument();
    expect(screen.getByText("Intent: commercial")).toBeInTheDocument();
    expect(screen.queryByText("Product", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("commercial", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
  });

  it("removes the engine switcher and exposes the live search action in metadata", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={keywordRows[0]}
        onTrack={vi.fn()}
        timeZone="UTC"
      />,
    );

    expect(screen.queryByRole("button", { name: "Google" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open live search results" })).toHaveAttribute(
      "href",
      expect.stringContaining("gl=us&hl=en"),
    );
  });

  it("presents target mismatch as a distinct state", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{
          ...keywordRows[0],
          rankingUrl: "https://example.com/actual",
          targetUrl: "https://example.com/expected",
        }}
        timeZone="UTC"
      />,
    );

    expect(screen.getByLabelText("Keyword check metadata")).toHaveTextContent("Target mismatch");
    expect(screen.queryByText("Matches target")).not.toBeInTheDocument();
  });

  it("keeps differing URLs mismatched without a tracked position", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{
          ...keywordRows[0],
          hasRankData: false,
          position: 0,
          rankingUrl: "https://example.com/actual",
          targetUrl: "https://example.com/expected",
        }}
        timeZone="UTC"
      />,
    );

    expect(screen.getByLabelText("Keyword check metadata")).toHaveTextContent("Target mismatch");
    expect(screen.queryByText("Matches target")).not.toBeInTheDocument();
  });

  it("formats the next check in the project timezone with the correct suffix", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{
          ...keywordRows[0],
          schedule: {
            ...keywordRows[0].schedule,
            next_check_at: "2026-08-11T06:00:00.000Z",
          },
        }}
        timeZone="Europe/Madrid"
      />,
    );

    const metadata = screen.getByLabelText("Keyword check metadata");
    expect(metadata).toHaveTextContent("Aug 11, 08:00");
    expect(metadata).toHaveTextContent("(Europe/Madrid)");
  });

  it("formats an older last check in the project timezone", () => {
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{ ...keywordRows[0], lastCheckAt: "2026-08-09T01:30:00.000Z" }}
        timeZone="America/New_York"
      />,
    );

    expect(screen.getByLabelText("Keyword check metadata")).toHaveTextContent(
      "Last check Aug 8, 21:30",
    );
  });
});
