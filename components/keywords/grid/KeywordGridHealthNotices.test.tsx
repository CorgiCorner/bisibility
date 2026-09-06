import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { MarketContextProvider } from "@/components/markets/MarketContextProvider";
import type { KeywordRow } from "@/lib/queries/keywords";
import { asMarketRef } from "@/lib/routing/app-path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordGridHealthNotices } from "./KeywordGridHealthNotices";

const rawProviderError = "All SERP providers failed: dataforseo (Ok.)";

function renderFailure(errorCode: string | null) {
  return render(
    <KeywordGridHealthNotices
      checkFailed={false}
      checkHealth={{
        budget: { capCents: 5000, exhausted: false, spentCents: 0 },
        failed24h: {
          count: 1,
          latest: {
            error: rawProviderError,
            errorCode,
            keyword: "open source rank tracker",
            provider: "dataforseo",
          },
        },
        providerRate: { overrideCents: null, providerId: "dataforseo" },
      }}
      onDismissFailure={vi.fn()}
      onRunChecks={vi.fn()}
      projectRef="prj_1"
      rows={[]}
    />,
  );
}

describe("KeywordGridHealthNotices", () => {
  it("shows safe billing copy without leaking the raw provider error", () => {
    renderFailure("provider_billing");

    expect(screen.queryByText(rawProviderError, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/provider account has insufficient funds/i)).toBeInTheDocument();
    expect(screen.getByText(/open source rank tracker:/i)).toBeInTheDocument();
  });

  it("uses safe generic copy when the persisted error code is missing", () => {
    renderFailure(null);

    expect(screen.queryByText(rawProviderError, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/because of a provider error/i)).toBeInTheDocument();
  });
});

// The failure-banner retry is the THIRD run-checks entry point, and the only one whose scope is
// every loaded row. Naming a market here would silently shrink a recovery action, so this pins
// it: standing inside a market changes neither its copy nor the rows it retries.
describe("KeywordGridHealthNotices inside one market", () => {
  const base = keywordRows[0] as KeywordRow;
  const rows: KeywordRow[] = [
    { ...base, id: "kw_us", location: { ...base.location, canonicalKey: "US" } },
    { ...base, id: "kw_de", location: { ...base.location, canonicalKey: "DE" } },
  ];

  it("retries every loaded row, whatever market the reader stands in", () => {
    const onRunChecks = vi.fn();
    render(
      <MarketContextProvider
        market={{ locationId: "loc_us", ref: asMarketRef("pmkt_us") }}
        projectRef="prj_1"
      >
        <KeywordGridHealthNotices
          checkFailed
          onDismissFailure={vi.fn()}
          onRunChecks={onRunChecks}
          projectRef="prj_1"
          rows={rows}
        />
      </MarketContextProvider>,
    );

    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeInTheDocument();
    fireEvent.click(retry);

    expect(onRunChecks).toHaveBeenCalledWith(["kw_us", "kw_de"]);
  });
});
