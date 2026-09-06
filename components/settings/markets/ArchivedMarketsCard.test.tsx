import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArchivedMarketsCard } from "./ArchivedMarketsCard";

const view = {
  markets: [
    { displayName: "Spain", id: "pmkt_spain", keywordCount: 12, languageLabel: "Spanish" },
    { displayName: "Belgium", id: "pmkt_belgium", keywordCount: 1, languageLabel: "Arabic" },
  ],
  projectId: "prj_abcdefghijklmnopqrstuvwx",
};

function renderCard(overrides: Partial<React.ComponentProps<typeof ArchivedMarketsCard>> = {}) {
  return render(
    <ArchivedMarketsCard canEdit markets={view} restoreMarket={vi.fn()} {...overrides} />,
  );
}

describe("ArchivedMarketsCard", () => {
  it("stays out of the page when nothing is archived", () => {
    renderCard({ markets: { markets: [], projectId: view.projectId } });

    expect(document.querySelector("[data-archived-markets-card]")).toBeNull();
  });

  it("states the resumed keyword count before the restore happens", () => {
    renderCard();
    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0] as HTMLElement);

    expect(screen.getByRole("dialog", { name: "Restore Spain / Spanish?" })).toHaveTextContent(
      "Restoring resumes checks for 12 keywords in this market and re-arms every alert rule scoped to it.",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Keywords archived on their own stay archived.",
    );
  });

  it("restores only after the confirmation is accepted", async () => {
    const restoreMarket = vi.fn();
    renderCard({ restoreMarket });
    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[1] as HTMLElement);

    expect(restoreMarket).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restore market" }));

    await waitFor(() =>
      expect(restoreMarket).toHaveBeenCalledWith({
        marketId: "pmkt_belgium",
        projectId: view.projectId,
      }),
    );
  });

  it("shows the refusal the action reports instead of a generic failure", async () => {
    const restoreMarket = vi
      .fn()
      .mockRejectedValue(new Error("This project can track up to 5 markets."));
    renderCard({ restoreMarket });
    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Restore market" }));

    expect(await screen.findByText("This project can track up to 5 markets.")).toBeVisible();
  });

  it("disables restore without the market edit capability", () => {
    renderCard({ canEdit: false });

    for (const button of screen.getAllByRole("button", { name: "Restore" })) {
      expect(button).toBeDisabled();
    }
  });
});
