import { renderWithResearchMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ActionPaymentPrice } from "./ActionPaymentPrice";
import { paymentQuote } from "./payment-test-fixture";

it("prefetches only an exact free estimate and displays future provider-native units", async () => {
  const action = vi.fn().mockResolvedValue({ ok: true, estimate: true, payment: paymentQuote() });
  render(
    <ActionPaymentPrice
      action={action}
      input={{ projectId: "project", snapshotRef: "revision-2", offset: 100 }}
    />,
  );
  expect(await screen.findByText("≈ 4 tokens")).toBeInTheDocument();
  expect(action).toHaveBeenCalledWith({
    projectId: "project",
    snapshotRef: "revision-2",
    offset: 100,
    estimateOnly: true,
    requirePayment: true,
  });
});

it("rounds a displayed credit estimate and keeps the exact amount in the title", async () => {
  const action = vi.fn().mockResolvedValue({
    estimate: true,
    ok: true,
    payment: paymentQuote({
      charge: {
        certainty: "estimate",
        unit: { kind: "credits", key: "bisibility", plural: "Credits", singular: "Credit" },
        value: "9.8889",
      },
    }),
  });
  render(<ActionPaymentPrice action={action} input={{ projectId: "project" }} />);
  expect(await screen.findByText("≈ 9.89 Credits")).toHaveAttribute("title", "≈ 9.8889 Credits");
});

it("shows Review price for expired or missing quotes instead of a scalar-dollar fallback", async () => {
  const action = vi.fn().mockResolvedValue({ ok: true, estimate: true, costCents: 999 });
  render(<ActionPaymentPrice action={action} input={{ projectId: "project" }} />);
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(screen.getByText("Review price")).toBeInTheDocument();
  expect(screen.queryByText(/9.99/)).not.toBeInTheDocument();
});
