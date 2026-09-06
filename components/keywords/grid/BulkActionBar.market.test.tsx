import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

const actions = {
  bulkClearTargetAction: vi.fn(async () => undefined),
  bulkDeleteAction: vi.fn(async () => undefined),
  bulkSetTargetAction: vi.fn(async () => undefined),
  bulkTagAction: vi.fn(async () => undefined),
};
const base = keywordRows[0] as KeywordRow;
const germanMarket: MarketScope = {
  canonicalKey: "DE",
  label: "Germany / German",
  ref: "pmkt_de",
};

function rowIn(id: string, canonicalKey: string): KeywordRow {
  return {
    ...base,
    id,
    location: { ...base.location, canonicalKey, id: canonicalKey },
    schedule: { ...base.schedule, serp_depth: 20 },
  };
}

const inMarket = rowIn("kw_de", "DE");
const outsideMarket = rowIn("kw_us", "US");

function renderBar(
  selectedRows: KeywordRow[],
  marketScope: MarketScope | null,
  onRunChecks = vi.fn(),
) {
  render(
    <BulkActionBar
      {...actions}
      canDeleteKeyword
      canUpdateKeyword
      marketScope={marketScope}
      onClear={vi.fn()}
      onRunChecks={onRunChecks}
      projectId="prj_1"
      selectedRows={selectedRows}
    />,
  );
  return onRunChecks;
}

describe("BulkActionBar inside one market", () => {
  it("names the market the selection spends in and spends only there", () => {
    const onRunChecks = renderBar([inMarket, outsideMarket], germanMarket);

    fireEvent.click(screen.getByRole("button", { name: "Run check in Germany / German (Top 20)" }));

    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_de"]);
  });

  it("puts the cross-market run on its own quieter control", () => {
    const onRunChecks = renderBar([inMarket, outsideMarket], germanMarket);

    const crossMarket = screen.getByRole("button", { name: "Run checks in all markets" });
    expect(crossMarket).toHaveClass("MuiButton-text");
    expect(crossMarket).not.toHaveClass("MuiButton-contained");

    fireEvent.click(crossMarket);
    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_de", "kw_us"]);
  });

  it("offers no cross-market control when the selection never leaves the market", () => {
    renderBar([inMarket], germanMarket);

    expect(
      screen.queryByRole("button", { name: "Run checks in all markets" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run check in Germany / German (Top 20)" }),
    ).toBeInTheDocument();
  });

  it("drops the in-market button when nothing selected belongs to this market", () => {
    const onRunChecks = renderBar([outsideMarket], germanMarket);

    expect(screen.queryByRole("button", { name: /^Run check in/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run checks in all markets" }));
    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_us"]);
  });

  it("leaves the project level exactly as it was", () => {
    const onRunChecks = renderBar([inMarket, outsideMarket], null);

    expect(
      screen.queryByRole("button", { name: "Run checks in all markets" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /in Germany/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run checks (Top 20)" }));
    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_de", "kw_us"]);
  });
});
