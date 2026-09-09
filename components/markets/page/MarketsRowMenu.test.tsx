import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarketsRowMenu } from "./MarketsRowMenu";

const market = {
  activeKeywordCount: 2,
  canonicalKey: "ES@es",
  countryCode: "ES",
  currentVisibility: 50,
  displayName: "Malaga",
  futureKeywordDevices: ["desktop", "mobile"] as ("desktop" | "mobile")[],
  id: "pmkt_abcdefghijklmnopqrstuvwx",
  keywordCount: 2,
  languageLabel: "Spanish",
  locationId: "location_malaga",
  monthlyCostCents: 515,
  name: "Malaga core",
  status: "active" as const,
  topThreeCount: 1,
};

describe("MarketsRowMenu", () => {
  it("supports keyboard trigger, navigation, selection, and escape through the real menu", async () => {
    const onAddKeywords = vi.fn();
    const user = userEvent.setup();
    render(
      <MarketsRowMenu
        canAddKeywords
        canArchive
        canEdit
        market={market}
        onAddKeywords={onAddKeywords}
        onArchive={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Actions for Malaga core" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    expect(
      await screen.findByRole("menu", { name: "Actions for Malaga core" }),
    ).toBeInTheDocument();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Edit market" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("menu", { name: "Actions for Malaga core" }),
      ).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    await screen.findByRole("menu", { name: "Actions for Malaga core" });
    await user.keyboard("{Enter}");

    expect(onAddKeywords).toHaveBeenCalledWith(market);
  });
});
