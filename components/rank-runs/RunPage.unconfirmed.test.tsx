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
    render(<RunPage {...unconfirmedRunFixture} canMutate projectRef="prj_example" />);
    expect(screen.getByText("2 of 2 selected targets started")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByText("2 of 2 targets processed")).toBeInTheDocument();
    expect(screen.queryByText("Remaining")).toBeNull();
    expect(screen.queryByText("Skipped before start")).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.getByText("estimate 4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2 skipped or blocked" }));
    const table = within(screen.getByRole("table"));
    expect(table.getAllByRole("link")).toHaveLength(2);
    expect(table.getAllByText("Not confirmed")).toHaveLength(2);
    expect(table.getAllByText("Not recorded")).toHaveLength(2);
    expect(
      table.getAllByText("Result not confirmed; not retried to avoid duplicate usage."),
    ).toHaveLength(2);
  });
});
