import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { renderWithBacklinksMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BacklinksWorkspace } from "./BacklinksWorkspace";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";

vi.mock("@/lib/actions/action-payment", () => ({
  assessActionPaymentsAction: vi.fn(async () => ({
    allowed: true,
    reason: null,
    charges: [paymentQuote().charge],
  })),
}));

it("confirms the exact backlinks lookup, then independently quotes an append against its saved revision", async () => {
  const quote = paymentQuote();
  const receipt = {
    actionId: "lookup",
    quoteId: quote.id,
    option: quote.option,
    state: "settled" as const,
    charge: { ...quote.charge, certainty: "measured" as const },
  };
  const snapshot = {
    ...backlinksSnapshotFixture,
    snapshotRef: "snapshot-revision-1",
    payment: receipt,
    fetchedRowCount: 100,
    totalRowsAvailable: 300,
  };
  const estimate = {
    ok: true as const,
    estimate: true as const,
    payment: quote,
    paymentOptions: [quote.option],
    cached: false,
    estimatedCostCents: 888,
  };
  const analyze = vi.fn(async (input: unknown) =>
    (input as { estimateOnly?: boolean }).estimateOnly ? estimate : snapshot,
  );
  const append = vi.fn(async (input: unknown) =>
    (input as { estimateOnly?: boolean }).estimateOnly
      ? estimate
      : {
          ok: true as const,
          rows: [],
          costCents: 999,
          fetchedRowCount: 200,
          totalRowsAvailable: 300,
          snapshotRef: "snapshot-revision-2",
          payment: receipt,
        },
  );
  render(
    <SessionSpendProvider>
      <BacklinksWorkspace
        analyzeAction={analyze as never}
        loadMoreAction={append as never}
        projectId="prj_1"
        initialTarget="example.com"
        initialEstimate={{
          cached: false,
          costCents: 888,
          loading: false,
          valid: true,
          payment: quote,
        }}
        context={{
          defaultTarget: "example.com",
          recentTargets: [],
          providerStatus: "connected",
          costContext: { capCents: 5000, spentCents: 0 },
        }}
      />
    </SessionSpendProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Analyze ≈ 4 tokens" }));
  const dialog = await screen.findByRole("dialog", { name: "Review cost" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Start" })).toBeEnabled());
  expect(
    analyze.mock.calls.every(([input]) => (input as { estimateOnly?: boolean }).estimateOnly),
  ).toBe(true);
  fireEvent.click(within(dialog).getByRole("button", { name: "Start" }));
  const results = await screen.findByRole("region", { name: "Backlinks results" });
  const paid = analyze.mock.calls
    .map(([input]) => input as Record<string, unknown>)
    .filter((input) => input.estimateOnly === false);
  expect(paid).toEqual([
    expect.objectContaining({
      target: "example.com",
      targetScope: "site",
      acceptedPayment: { quoteToken: quote.quoteToken },
      paymentOptionId: quote.option.id,
    }),
  ]);
  fireEvent.click(within(results).getByRole("button", { name: /Load 100 more/ }));
  const appendDialog = await screen.findByRole("dialog", { name: "Review cost" });
  await waitFor(() =>
    expect(within(appendDialog).getByRole("button", { name: "Start" })).toBeEnabled(),
  );
  expect(
    append.mock.calls.every(([input]) => (input as { estimateOnly?: boolean }).estimateOnly),
  ).toBe(true);
  fireEvent.click(within(appendDialog).getByRole("button", { name: "Start" }));
  await waitFor(() =>
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotRef: "snapshot-revision-1",
        target: snapshot.target,
        limit: 100,
        acceptedPayment: { quoteToken: quote.quoteToken },
        estimateOnly: false,
      }),
    ),
  );
});
