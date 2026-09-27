import { renderWithProjectMarketsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
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
  it.each([true, false])(
    "gates the whole-market manual run by permission: %s",
    async (canRunChecks) => {
      const onRunChecks = vi.fn();
      const user = userEvent.setup();
      render(
        <MarketsRowMenu
          canAddKeywords
          canArchive
          canEdit
          canRunChecks={canRunChecks}
          market={market}
          onArchive={vi.fn()}
          onEdit={vi.fn()}
          onRunChecks={onRunChecks}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Actions for Malaga core" }));
      const action = screen.getByRole("menuitem", { name: "Run checks for entire market" });
      await user.click(action);
      if (canRunChecks) {
        expect(onRunChecks).toHaveBeenCalledWith(market);
      } else {
        expect(action).toHaveAttribute("aria-disabled", "true");
        expect(onRunChecks).not.toHaveBeenCalled();
      }
    },
  );

  it.each(["paused", "removed"] as const)("does not run an inactive market: %s", async (status) => {
    const onRunChecks = vi.fn();
    const user = userEvent.setup();
    render(
      <MarketsRowMenu
        canAddKeywords
        canArchive
        canEdit
        canRunChecks
        market={{ ...market, status }}
        onArchive={vi.fn()}
        onEdit={vi.fn()}
        onRunChecks={onRunChecks}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Actions for Malaga core" }));
    await user.click(screen.getByRole("menuitem", { name: "Run checks for entire market" }));
    expect(onRunChecks).not.toHaveBeenCalled();
  });

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
