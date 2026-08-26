import { render, screen } from "@testing-library/react";
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
