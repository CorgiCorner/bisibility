import {
  SessionSpendProvider,
  useSessionSpend,
} from "@/components/cost-estimate/SessionSpendProvider";
import {
  renderWithBacklinksMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { AnalyzeBacklinksAction } from "@/lib/actions/backlinks";
import en from "@/messages/core/en/project-backlinks.json";
import es from "@/messages/core/es-ES/project-backlinks.json";
import ja from "@/messages/core/ja/project-backlinks.json";
import pl from "@/messages/core/pl/project-backlinks.json";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BacklinksFailedSummary } from "./BacklinksFailedSummary";
import { BacklinksWorkspace } from "./BacklinksWorkspace";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";

const summary = {
  backlinksTotal: 123,
  brokenBacklinks: 2,
  brokenPages: 1,
  dofollowPct: 80,
  domainRank: 42,
  lostBacklinks: 3,
  lostReferringDomains: 1,
  newBacklinks: 5,
  newReferringDomains: 2,
  referringDomainsTotal: 12,
  referringPages: 20,
  spamScore: 1,
};
const failure = {
  ok: false as const,
  status: "failed" as const,
  reason: "history_failed" as const,
  costCents: null,
  knownSummaryCostCents: 5,
  summary,
  historyStatus: "failed" as const,
  rowsStatus: "not_requested" as const,
  historyFailure: { code: "provider_usage_unconfirmed" as const, phase: "measurement" as const },
  provider: "dataforseo",
  target: "example.com",
  targetScope: "site" as const,
  includeSubdomains: true,
};

function SpendProbe() {
  return <output aria-label="session spend cents">{useSessionSpend().sessionCents}</output>;
}

function workspace(action: AnalyzeBacklinksAction, loadMoreAction = vi.fn()) {
  return render(
    <SessionSpendProvider>
      <SpendProbe />
      <BacklinksWorkspace
        analyzeAction={action}
        context={{
          costContext: { capCents: 5000, spentCents: 0 },
          defaultTarget: "example.com",
          providerStatus: "connected",
          recentTargets: [],
        }}
        initialEstimate={{ cached: false, costCents: 5, loading: false, valid: true }}
        initialTarget="example.com"
        loadMoreAction={loadMoreAction}
        projectId="org_fixture"
      />
    </SessionSpendProvider>,
  );
}

function previousSnapshot() {
  return {
    ...backlinksSnapshotFixture,
    cached: false,
    cachedUntil: new Date(Date.now() + 3_600_000).toISOString(),
    costCents: 7,
    fetchedAt: new Date(Date.now() - 3_600_000).toISOString(),
    fetchedRowCount: 100,
    history: [],
    rows: [
      {
        ...backlinksSnapshotFixture.rows[0],
        sourceDomain: "previous.example.com",
        sourceUrl: "https://previous.example.com/review",
        targetUrl: "https://example.com/",
      },
    ],
    summary: { ...summary, backlinksTotal: 40 },
    target: "example.com",
    totalRowsAvailable: 200,
  };
}

describe("failed backlinks summary consumer", () => {
  it.each([
    { locale: "en" as const, messages: en },
    { locale: "es-ES" as const, messages: es },
    { locale: "ja" as const, messages: ja },
    { locale: "pl" as const, messages: pl },
  ])(
    "uses real $locale failure and unknown-cost copy without rounding a known cost to zero",
    ({ locale, messages }) => {
      const copy = messages.projectBacklinks.workspace.failedSummary;
      renderWithFeatureMessages(
        <BacklinksFailedSummary evidence={{ ...failure, knownSummaryCostCents: 0.5 }} />,
        { locale, messages },
      );
      const region = screen.getByRole("region", { name: copy.title });
      expect(within(region).getByText(copy.costUnknown)).toBeInTheDocument();
      const cost = new Intl.NumberFormat(locale, {
        currency: "USD",
        maximumFractionDigits: 4,
        minimumFractionDigits: 2,
        style: "currency",
      }).format(0.005);
      const expected = copy.knownSummaryCost.replace("{cost}", cost);
      expect(
        within(region).getByText(
          (content) => content.replace(/\s/g, " ") === expected.replace(/\s/g, " "),
        ),
      ).toBeInTheDocument();
      expect(within(region).queryByRole("table")).not.toBeInTheDocument();
      expect(within(region).queryByRole("img")).not.toBeInTheDocument();
      expect(within(region).queryByRole("button")).not.toBeInTheDocument();
    },
  );

  it("shows failed summary facts with unknown total cost without success surfaces or spend", async () => {
    const action = vi.fn(async () => failure);
    workspace(action as unknown as AnalyzeBacklinksAction);
    fireEvent.click(screen.getByRole("button", { name: "Analyze ~$0.05" }));
    const region = await screen.findByRole("region", { name: "Failed backlinks analysis" });
    expect(
      within(region).getByText(
        "Summary only for example.com. History failed and backlink rows were not requested.",
      ),
    ).toBeInTheDocument();
    expect(within(region).getByText("Total cost is unknown.")).toBeInTheDocument();
    expect(within(region).getByText("Known summary cost: $0.05")).toBeInTheDocument();
    expect(within(region).getByText("123")).toBeInTheDocument();
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
    expect(within(region).queryByRole("table")).not.toBeInTheDocument();
    expect(within(region).queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Backlinks results" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recent targets" })).not.toBeInTheDocument();
    expect(screen.queryByText("Point it at any domain")).not.toBeInTheDocument();
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("0");
    expect(action).toHaveBeenCalledOnce();
  });

  it("suppresses an eligible paid continuation after failed refresh and explicit repeat", async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce(previousSnapshot())
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(failure);
    const loadMoreAction = vi.fn();
    workspace(action as AnalyzeBacklinksAction, loadMoreAction);
    fireEvent.click(screen.getByRole("button", { name: "Analyze ~$0.05" }));
    const results = await screen.findByRole("region", { name: "Backlinks results" });
    expect(within(results).getByRole("button", { name: /Load 100 more/ })).toBeEnabled();
    expect(within(results).getByText("previous.example.com")).toBeInTheDocument();
    const recentText = screen.getByRole("region", { name: "Recent targets" }).textContent;
    fireEvent.click(screen.getByRole("button", { name: /Refresh now/ }));
    await screen.findByRole("region", { name: "Failed backlinks analysis" });
    expect(
      screen.getByText("Previous successful result. The failed analysis did not replace it."),
    ).toBeInTheDocument();
    const prior = screen.getByRole("region", { name: "Backlinks results" });
    expect(within(prior).getByText("previous.example.com")).toBeInTheDocument();
    expect(within(prior).getByText("40")).toBeInTheDocument();
    expect(within(prior).queryByText("123")).not.toBeInTheDocument();
    expect(
      within(prior).queryByRole("button", { name: /Refresh now|Load 100 more/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("7");
    expect(screen.getByRole("region", { name: "Recent targets" }).textContent).toBe(recentText);
    expect(loadMoreAction).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Analyze ~$0.05" }));
    await screen.findByRole("region", { name: "Failed backlinks analysis" });
    expect(screen.getByRole("region", { name: "Backlinks results" })).toHaveTextContent(
      "previous.example.com",
    );
    expect(
      screen.queryByRole("button", { name: /Refresh now|Load 100 more/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Recent targets" }).textContent).toBe(recentText);
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("7");
    expect(loadMoreAction).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(3);
  });

  it("passes known-cost history unavailability through the real successful result", async () => {
    const action = vi.fn(async () => ({ ...previousSnapshot(), historyUnavailable: true }));
    workspace(action as AnalyzeBacklinksAction);
    fireEvent.click(screen.getByRole("button", { name: "Analyze ~$0.05" }));
    const results = await screen.findByRole("region", { name: "Backlinks results" });
    expect(within(results).getByRole("status")).toHaveTextContent(
      "History is unavailable for this result. The summary and links are still available.",
    );
    expect(within(results).getByText("previous.example.com")).toBeInTheDocument();
    expect(within(results).queryByRole("region", { name: "New vs lost" })).not.toBeInTheDocument();
    expect(within(results).getByRole("button", { name: /Load 100 more/ })).toBeEnabled();
    expect(
      screen.queryByRole("region", { name: "Failed backlinks analysis" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("7");
    expect(action).toHaveBeenCalledOnce();
  });
});
