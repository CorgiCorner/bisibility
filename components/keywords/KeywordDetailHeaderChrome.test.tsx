import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";

describe("KeywordDetailHeaderChrome", () => {
  it("uses the calibrated compact ID chip", () => {
    render(<KeywordDetailHeaderChrome actions={null} keyword={keywordRows[0]} />);

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
      />,
    );

    expect(screen.getByText("Topic: Product")).toBeInTheDocument();
    expect(screen.getByText("Intent: commercial")).toBeInTheDocument();
    expect(screen.queryByText("Product", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("commercial", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
  });
});
