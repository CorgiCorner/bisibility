import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KeywordInlineEdit } from "./KeywordInlineEdit";

function keyword(overrides: Partial<KeywordRow> = {}): KeywordRow {
  return { ...keywordRows[0], ...overrides };
}

const drawerMarkets = [
  {
    canonicalKey: "US",
    countryCode: "US",
    displayName: "United States",
    id: "pmkt_us",
    languageLabel: "English",
    languageCode: "en",
    monthlyCostCents: null,
    researchAvailable: true,
    status: "active" as const,
  },
  {
    canonicalKey: "ES",
    countryCode: "ES",
    displayName: "Spain",
    id: "pmkt_es",
    languageLabel: "Spanish",
    languageCode: "es",
    monthlyCostCents: null,
    researchAvailable: true,
    status: "active" as const,
  },
  {
    canonicalKey: "BE@fr",
    countryCode: "BE",
    displayName: "Belgium",
    id: "pmkt_be_fr",
    languageLabel: "French",
    languageCode: "fr",
    monthlyCostCents: null,
    researchAvailable: true,
    status: "paused" as const,
  },
];

describe("KeywordInlineEdit drawer markets", () => {
  it("uses active registry markets and submits the selected canonical key", async () => {
    const user = userEvent.setup();
    const updateKeywordAction = vi.fn(async () => ({}));
    render(
      <KeywordInlineEdit
        drawerMarkets={drawerMarkets}
        keyword={keyword()}
        layout="drawer"
        onSaved={vi.fn()}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    expect(screen.queryByRole("combobox", { name: /location/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Market" }));
    const paused = screen.getByRole("menuitem", { name: /Belgium \/ French/ });
    expect(paused).toHaveTextContent("paused");
    expect(paused).toHaveAttribute("aria-disabled", "true");
    expect(paused).not.toHaveAttribute("title");
    const pausedDescId = paused.getAttribute("aria-describedby");
    expect(pausedDescId).not.toBeNull();
    expect(document.getElementById(pausedDescId ?? "")).toHaveTextContent(
      "Enable this market in Settings before selecting it.",
    );
    await user.click(screen.getByRole("menuitem", { name: /Spain \/ Spanish/ }));
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateKeywordAction).toHaveBeenCalledOnce());
    expect(updateKeywordAction).toHaveBeenCalledWith(
      expect.objectContaining({ locationKey: "ES" }),
    );
  });

  it("keeps an off-catalog target visible as a disabled legacy option", async () => {
    const user = userEvent.setup();
    const current = keyword({
      location: {
        ...keywordRows[0].location,
        canonicalKey: "ES@ca",
        countryCode: "ES",
        displayName: "Spain",
        hl: "ca",
      },
      locationName: "Spain",
    });
    render(
      <KeywordInlineEdit
        drawerMarkets={[]}
        keyword={current}
        layout="drawer"
        onSaved={vi.fn()}
        updateKeywordAction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Market" }));
    const legacy = screen.getByRole("menuitem", { name: /no longer in registry/ });
    expect(legacy).toHaveAttribute("aria-disabled", "true");
    expect(legacy).not.toHaveAttribute("title");
    const legacyDescId = legacy.getAttribute("aria-describedby");
    expect(legacyDescId).not.toBeNull();
    expect(document.getElementById(legacyDescId ?? "")).toHaveTextContent(
      "This market is no longer available in the project registry.",
    );
  });
});
