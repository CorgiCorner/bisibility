import { countryValueForCode } from "@/components/keywords/location-picker-data";
import { serpLanguageCatalog } from "@/lib/serp/generated/serp-language-catalog";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketPicker } from "./MarketPicker";
import { recommendedMarketLanguages } from "./market-picker-model";

vi.mock("@/components/keywords/LocationField", () => ({
  LocationField: ({ onChange }: { onChange: (value: object) => void }) => (
    <button
      onClick={() =>
        onChange({
          canonicalKey: "DE",
          cityName: null,
          countryCode: "DE",
          displayName: "Germany",
          hl: "de",
          kind: "country",
          languageCode: "de",
          languageLabel: "German",
          regionName: null,
        })
      }
      type="button"
    >
      Change location to Germany
    </button>
  ),
}));

const offCatalogNote =
  "English: no search volume or difficulty data for this market - positions are tracked normally.";

function spain() {
  const location = countryValueForCode("ES");
  if (!location) throw new Error("Spain fixture is missing.");
  return location;
}

function renderPicker(trackedCanonicalKeys: readonly string[] = [], onCommit = vi.fn()) {
  render(
    <MarketPicker
      initialLocation={spain()}
      onCommit={onCommit}
      projectId="prj_test"
      trackedCanonicalKeys={trackedCanonicalKeys}
    />,
  );
  return onCommit;
}

function expand() {
  fireEvent.click(screen.getByRole("button", { name: "More languages" }));
}

function languageList() {
  return within(screen.getByRole("group", { name: "Languages" }));
}

function rowLabels() {
  return languageList()
    .getAllByRole("button")
    .map((row) => row.firstElementChild?.textContent ?? "");
}

function showEnglish() {
  expand();
  fireEvent.change(screen.getByRole("textbox", { name: "Search more languages" }), {
    target: { value: "English" },
  });
}

describe("MarketPicker", () => {
  it("commits default and positions-only pairs with canonical identities", async () => {
    const onCommit = renderPicker();

    expect(screen.getByRole("button", { name: "Spanish" })).toHaveAttribute("aria-pressed", "true");
    showEnglish();
    const english = screen.getByRole("button", { name: /English.*no volume\/KD/ });
    expect(english).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(english);
    fireEvent.click(screen.getByRole("button", { name: "Add 2" }));

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith([
        expect.objectContaining({ canonicalKey: "ES", researchAvailable: true }),
        expect.objectContaining({ canonicalKey: "ES@en", researchAvailable: false }),
      ]),
    );
  });

  it("does not recommit tracked pairs", async () => {
    const onCommit = renderPicker(["ES"]);

    expect(screen.getByRole("button", { name: /Spanish.*TRACKED/ })).toBeDisabled();
    expect(screen.getByText("SUGGESTED LANGUAGES")).toHaveStyle({ fontSize: "9px" });
    expect(screen.getByText("TRACKED")).toHaveStyle({ fontSize: "9px" });
    expect(screen.getByRole("button", { name: "Add market" })).toBeDisabled();
    showEnglish();
    fireEvent.click(screen.getByRole("button", { name: /English.*no volume\/KD/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith([expect.objectContaining({ canonicalKey: "ES@en" })]),
    );
  });

  it("clears pending languages when geography changes", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Catalan/ }));
    expect(screen.getByRole("button", { name: "Add 2" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Change location to Germany" }));

    expect(screen.queryByRole("button", { name: /Catalan/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "German" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Add 1" })).toBeEnabled();
  });

  it("keeps a selection that the current search no longer shows", async () => {
    const onCommit = renderPicker();
    showEnglish();
    fireEvent.click(screen.getByRole("button", { name: /English.*no volume\/KD/ }));
    expect(screen.getByRole("button", { name: "Add 2" })).toBeEnabled();

    // Narrowing the search must not silently discard what the user already picked.
    fireEvent.change(screen.getByRole("textbox", { name: "Search more languages" }), {
      target: { value: "Zulu" },
    });

    expect(screen.queryByRole("button", { name: /^English/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add 2" }));

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith([
        expect.objectContaining({ canonicalKey: "ES" }),
        expect.objectContaining({ canonicalKey: "ES@en" }),
      ]),
    );
  });

  it("keeps a selection that collapsing hides, and keeps its note on screen", async () => {
    const onCommit = renderPicker();
    showEnglish();
    fireEvent.click(screen.getByRole("button", { name: /English.*no volume\/KD/ }));

    // Collapsing unmounts the row. Dropping the pick would be the same silent discard the
    // search path had, so it is retained - and the note keeps naming what will commit.
    fireEvent.click(screen.getByRole("button", { name: "Suggested only" }));

    expect(screen.queryByRole("button", { name: /^English/ })).not.toBeInTheDocument();
    expect(screen.getByText(offCatalogNote)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add 2" }));

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith([
        expect.objectContaining({ canonicalKey: "ES" }),
        expect.objectContaining({ canonicalKey: "ES@en" }),
      ]),
    );
  });

  it("states the off-catalog sentence once, under the selection", () => {
    renderPicker();
    showEnglish();
    expect(screen.queryByText(offCatalogNote)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /English.*no volume\/KD/ }));

    const notes = screen.getAllByText(offCatalogNote);
    expect(notes).toHaveLength(1);
    expect(screen.getAllByText("no volume/KD").length).toBeGreaterThan(0);

    // "Under the selection" is the point, not merely "once somewhere": the note sits
    // after the scrolling list, so it cannot scroll out of view with the rows.
    const list = screen.getByRole("group", { name: "Languages" });
    expect(list).not.toContainElement(notes[0]);
    expect(list.compareDocumentPosition(notes[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("hangs the off-catalog sentence on the focusable row, not on the suffix", () => {
    renderPicker();
    showEnglish();
    const row = screen.getByRole("button", { name: /English.*no volume\/KD/ });

    // A span inside a button never takes focus, so a suffix-anchored tooltip would be
    // pointer-only. The description belongs to the element focus actually reaches, and
    // it must stay a description: the row is still named by its language and suffix.
    expect(row).toHaveAttribute("title", offCatalogNote);
    expect(screen.getByText("no volume/KD")).not.toHaveAttribute("title");
  });

  it("keeps the off-catalog sentence on a tracked row that cannot take focus", () => {
    renderPicker(["ES@en"]);
    showEnglish();
    const row = screen.getByRole("button", { name: /English.*TRACKED/ });
    expect(row).toBeDisabled();

    // A disabled button emits no pointer or focus events, so the description has to hang
    // on the wrapper MUI documents rather than on the button itself.
    expect(row).not.toHaveAttribute("title");
    expect(row.parentElement).toHaveAttribute(
      "title",
      "English: no search volume or difficulty data for this market - positions are tracked normally.",
    );
  });
});
