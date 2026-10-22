import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RunPage } from "./RunPage";
import { unconfirmedRunFixture } from "./RunPageUnconfirmedFixture";

vi.mock("@/components/shell/AppRealtimeProvider", () => ({
  useAppRealtime: () => ({ operations: [], status: "live" }),
}));

describe("completed run with unconfirmed checks", () => {
  it("finishes progress, preserves started facts, and filters blocked targets without claiming they were skipped", async () => {
    const user = userEvent.setup();
    const quote = paymentQuote();
    render(
      <RunPage
        {...unconfirmedRunFixture}
        run={{
          ...unconfirmedRunFixture.run,
          payment: {
            actionId: unconfirmedRunFixture.run.id,
            quoteId: quote.id,
            option: quote.option,
            state: "unknown",
            charge: { ...quote.charge, certainty: "unknown", value: null },
          },
        }}
        canMutate
        projectRef="prj_example"
      />,
    );
    expect(screen.getByText("2 of 2 selected targets started")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByText("2 of 2 targets processed")).toBeInTheDocument();
    expect(screen.queryByText("Remaining")).toBeNull();
    expect(screen.queryByText("Skipped before start")).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(
      screen.getByText("On your Example provider key · Charge not confirmed"),
    ).toBeInTheDocument();
    expect(screen.queryByText("estimate 4")).toBeNull();
    await user.click(screen.getByRole("button", { name: "2 skipped or blocked" }));
    const table = within(screen.getByRole("table"));
    expect(table.getAllByRole("link")).toHaveLength(2);
    expect(table.getAllByText("Not confirmed")).toHaveLength(2);
    expect(table.getAllByText("Payment details unavailable")).toHaveLength(2);
    expect(table.queryByText("Not recorded")).toBeNull();
    expect(
      table.getAllByText("Result not confirmed; not retried to avoid duplicate usage."),
    ).toHaveLength(2);
  });
});
