import { renderWithProjectRankTrackerMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import type { RankTrackerAiOverviewFact } from "@/lib/queries/rank-tracker-ai-overview-facts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  AiOverviewDomainCell,
  AiOverviewPageCell,
  AiOverviewStatusCell,
  aiOverviewFactForRow,
} from "./KeywordAiOverviewColumns";

const row = { id: "kw_1", device: "mobile", keyword: "directory" } as KeywordRow;

function fact(
  patch: Partial<RankTrackerAiOverviewFact["citation"]> & { citedPath?: string | null },
): RankTrackerAiOverviewFact {
  return {
    keywordId: row.id,
    checkedAt: "2026-11-09T07:11:00.000Z",
    citedPath: patch.citedPath ?? null,
    citation: {
      shown: true,
      cited: false,
      citedPosition: null,
      citedUrl: null,
      sourceCount: 0,
      complete: true,
      ...patch,
    },
    overview:
      patch.shown === false ? null : { present: true, paragraphs: ["Stored answer"], sources: [] },
  };
}

const parent = {
  ...row,
  id: "market-group:directory",
  marketGrid: { kind: "parent", aggregate: { activeTargetCount: 1 } },
  subRows: [{ id: "kw_child" }],
} as KeywordRow;

describe("AI Overview columns", () => {
  it("renders Shown, Not shown and Not checked as chips", () => {
    renderWithProjectRankTrackerMessages(
      <>
        <AiOverviewStatusCell row={row} fact={fact({ shown: true })} />
        <AiOverviewStatusCell row={row} fact={fact({ shown: false })} />
        <AiOverviewStatusCell row={row} />
        <AiOverviewDomainCell row={row} fact={fact({ shown: false })} />
        <AiOverviewPageCell row={row} fact={fact({ shown: false })} />
        <AiOverviewDomainCell row={row} />
        <AiOverviewPageCell row={row} />
      </>,
    );
    expect(screen.getByText("Shown").closest("[data-status-chip-tone]")).toHaveAttribute(
      "data-status-chip-tone",
      "positive",
    );
    expect(screen.getByText("Not shown").closest("[data-status-chip-tone]")).toHaveAttribute(
      "data-status-chip-tone",
      "neutral",
    );
    expect(screen.getByText("Not checked").closest("[data-status-chip-tone]")).toHaveAttribute(
      "data-status-chip-tone",
      "attention",
    );
    expect(screen.getAllByText("-")).toHaveLength(4);
    expect(screen.queryByText("n/a")).not.toBeInTheDocument();
    expect(screen.queryByText("none")).not.toBeInTheDocument();
  });

  it("keeps a chip on a grouped row when the latest check has no overview", () => {
    renderWithProjectRankTrackerMessages(
      <>
        <AiOverviewStatusCell row={parent} fact={fact({ shown: false })} />
        <AiOverviewDomainCell row={parent} fact={fact({ shown: false })} />
        <AiOverviewPageCell row={parent} fact={fact({ shown: false })} />
      </>,
    );
    expect(screen.getByText("Not shown")).toBeInTheDocument();
    expect(screen.getAllByText("-")).toHaveLength(2);
    expect(screen.queryByText("n/a")).not.toBeInTheDocument();
    expect(screen.queryByText("none")).not.toBeInTheDocument();
  });

  it("reads the only target when the grouped row id is not a keyword id", () => {
    const resolved = aiOverviewFactForRow(parent, new Map([["kw_child", fact({ shown: false })]]));
    expect(resolved?.citation.shown).toBe(false);
  });

  it("shows not checked when the keyword has no completed check", () => {
    renderWithProjectRankTrackerMessages(
      <>
        <AiOverviewStatusCell row={row} />
        <AiOverviewDomainCell row={row} />
        <AiOverviewPageCell row={row} />
      </>,
    );
    expect(screen.getByText("Not checked")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
    expect(screen.queryByText("n/a")).not.toBeInTheDocument();
    expect(screen.queryByText("none")).not.toBeInTheDocument();
  });

  it("does not claim Not cited for an incomplete block, and cites a complete one", async () => {
    const { rerender } = renderWithProjectRankTrackerMessages(
      <AiOverviewDomainCell row={row} fact={fact({ complete: false, shown: true })} />,
    );
    expect(screen.getByText("n/a")).toBeInTheDocument();
    expect(screen.queryByText("Not cited")).not.toBeInTheDocument();
    await userEvent.hover(screen.getByText("n/a"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("no source list");
    rerender(
      <>
        <AiOverviewDomainCell
          row={row}
          fact={fact({
            cited: true,
            citedPosition: 2,
            citedUrl: "https://example.com/docs",
            complete: true,
            shown: true,
            citedPath: "/docs",
          })}
        />
        <AiOverviewPageCell
          row={row}
          fact={fact({
            cited: true,
            citedPosition: 2,
            citedUrl: "https://example.com/docs",
            complete: true,
            shown: true,
            citedPath: "/docs",
          })}
        />
      </>,
    );
    expect(screen.getByText("Cited · #2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "/docs" })).toHaveAttribute(
      "href",
      "https://example.com/docs",
    );
  });
});
