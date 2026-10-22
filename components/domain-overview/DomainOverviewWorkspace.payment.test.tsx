import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DomainOverviewWorkspace } from "./DomainOverviewWorkspace";
import { domainOverviewReportFixture, domainOverviewScopeFixture } from "./fixtures";

vi.mock("@/lib/actions/action-payment", () => ({
  assessActionPaymentsAction: vi.fn(async () => ({
    allowed: true,
    reason: null,
    charges: [paymentQuote().charge],
  })),
}));

it("reviews history and both table pages separately with their exact saved scope and offsets", async () => {
  const quote = paymentQuote();
  const receipt = {
    actionId: "lookup",
    quoteId: quote.id,
    option: quote.option,
    state: "settled" as const,
    charge: { ...quote.charge, certainty: "measured" as const },
  };
  const base = domainOverviewReportFixture;
  if (!base.keywords.ok || !base.pages.ok) throw new Error("Expected available fixtures");
  const report = {
    ...base,
    payment: receipt,
    keywords: { ...base.keywords, data: { ...base.keywords.data, totalCount: 300 } },
    pages: { ...base.pages, data: { ...base.pages.data, totalCount: 300 } },
  };
  const estimate = {
    ok: true as const,
    estimate: true as const,
    payment: quote,
    paymentOptions: [quote.option],
    cached: false,
    estimatedCostCents: 900,
  };
  const action = (data: unknown) =>
    vi.fn(async (input: unknown) =>
      (input as { estimateOnly?: boolean }).estimateOnly
        ? estimate
        : {
            ok: true as const,
            cached: false,
            costCents: 900,
            payment: receipt,
            data,
          },
    );
  const history = action([]);
  const keywords = action({ ...base.keywords.data, rows: [], offset: 100, totalCount: 300 });
  const pages = action({ ...base.pages.data, rows: [], offset: 100, totalCount: 300 });
  const analyze = vi.fn(async () => estimate);
  render(
    <SessionSpendProvider>
      <DomainOverviewWorkspace
        projectId="prj_1"
        projectRef="prj_1"
        initialTarget={report.target}
        initialOutcome={report}
        initialEstimate={{
          cached: false,
          costCents: 900,
          freshCostCents: 900,
          historyCostCents: 900,
          keywordPageCostCents: 900,
          pagePageCostCents: 900,
          loading: false,
          valid: true,
          payment: quote,
        }}
        context={{
          competitorDomains: [],
          catalogScopes: [],
          trackedScopes: [],
          defaultTarget: report.target,
          recentTargets: [],
          providerStatus: "connected",
          costContext: { capCents: 5000, spentCents: 0 },
        }}
        researchScope={domainOverviewScopeFixture}
        analyzeAction={analyze as never}
        loadHistoryAction={history as never}
        loadKeywordsPageAction={keywords as never}
        loadPagesPageAction={pages as never}
      />
    </SessionSpendProvider>,
  );
  for (const [name, server, extra] of [
    [/Load history/, history, {}],
    [/Load next 100 keywords/, keywords, { limit: 100, offset: 100 }],
    [/Load next 100 pages/, pages, { limit: 100, offset: 100 }],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name }));
    const dialog = await screen.findByRole("dialog", { name: "Review cost" });
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Start" })).toBeEnabled(),
    );
    expect(
      server.mock.calls.every(([input]) => (input as { estimateOnly?: boolean }).estimateOnly),
    ).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(server).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "prj_1",
          target: report.target,
          scopeOverride: report.scope,
          locationCode: report.locationCode,
          languageCode: report.languageCode,
          fresh: false,
          ...extra,
          acceptedPayment: { quoteToken: quote.quoteToken },
          estimateOnly: false,
        }),
      ),
    );
  }
}, 15_000);
