import { countryValueForCode } from "@/components/keywords/location-picker-data";
import { serpLanguageCatalog } from "@/lib/serp/generated/serp-language-catalog";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

const _offCatalogNote =
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

describe("MarketPicker language list", () => {
  it("labels both groups and never heads the full list with the suggested label", () => {
    renderPicker();
    expect(screen.getByText("SUGGESTED LANGUAGES")).toBeVisible();
    expect(screen.queryByText("ALL LANGUAGES")).not.toBeInTheDocument();

    expand();

    const headings = screen
      .getAllByText(/^(SUGGESTED|ALL) LANGUAGES$/)
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["SUGGESTED LANGUAGES", "ALL LANGUAGES"]);
  });

  it("names each group for assistive technology, not only visually", () => {
    renderPicker();
    expand();

    // A styled label reaches sighted users only. Without the grouping element and its
    // aria-labelledby, "suggested" is a fact a screen-reader user cannot obtain.
    const suggested = screen.getByRole("group", { name: "SUGGESTED LANGUAGES" });
    const all = screen.getByRole("group", { name: "ALL LANGUAGES" });

    expect(within(suggested).getByRole("button", { name: /^Spanish/ })).toBeVisible();
    expect(within(all).getByRole("button", { name: /^Vietnamese/ })).toBeVisible();
    expect(within(suggested).queryByRole("button", { name: /^Vietnamese/ })).toBeNull();
  });

  it("sorts each group alphabetically and keeps a selected language in place", () => {
    renderPicker();
    // Spain: default Spanish plus the CLDR suggestions, sorted by label rather than by
    // catalog order, so the default does not jump the queue.
    expect(rowLabels()).toEqual(["Catalan", "Galician", "Spanish"]);

    fireEvent.click(screen.getByRole("button", { name: /^Catalan/ }));

    expect(rowLabels()).toEqual(["Catalan", "Galician", "Spanish"]);
    expect(screen.getByRole("button", { name: /^Catalan/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("sorts the expanded group alphabetically as well", () => {
    renderPicker();
    expand();

    // Sliced by the suggested group's real size, not a hardcoded 3: a smaller suggested
    // group would otherwise pull an ALL row into the slice and hide an unsorted seam.
    const all = rowLabels().slice(recommendedMarketLanguages(spain()).length);
    expect(all).toEqual([...all].sort((left, right) => left.localeCompare(right, "en")));
  });

  it("offers the whole committed language catalog once expanded", () => {
    renderPicker();
    expand();

    const codes = rowLabels();
    expect(codes).toHaveLength(serpLanguageCatalog.length);
    expect(new Set(codes).size).toBe(serpLanguageCatalog.length);
    for (const label of ["French", "Hindi", "Vietnamese"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
  });

  it("expands and collapses through one button that states its state", () => {
    renderPicker();
    const toggle = () => screen.getByRole("button", { name: /More languages|Suggested only/ });
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("ALL LANGUAGES")).toBeVisible();

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("ALL LANGUAGES")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Search more languages" }),
    ).not.toBeInTheDocument();
    expect(rowLabels()).toEqual(["Catalan", "Galician", "Spanish"]);
  });

  it("filters both groups so a labelled group never keeps a non-matching row", () => {
    renderPicker();
    showEnglish();

    expect(rowLabels()).toEqual(["English"]);
    expect(screen.queryByText("SUGGESTED LANGUAGES")).not.toBeInTheDocument();
    expect(screen.getByText("ALL LANGUAGES")).toBeVisible();

    fireEvent.change(screen.getByRole("textbox", { name: "Search more languages" }), {
      target: { value: "Catal" },
    });

    expect(rowLabels()).toEqual(["Catalan"]);
    expect(screen.getByText("SUGGESTED LANGUAGES")).toBeVisible();
    expect(screen.queryByText("ALL LANGUAGES")).not.toBeInTheDocument();
  });

  it("says so when nothing matches instead of showing empty group labels", () => {
    renderPicker();
    showEnglish();
    fireEvent.change(screen.getByRole("textbox", { name: "Search more languages" }), {
      target: { value: "zzzz" },
    });

    expect(screen.getByText("No supported language matches that search.")).toBeVisible();
    expect(screen.queryByText("SUGGESTED LANGUAGES")).not.toBeInTheDocument();
    expect(screen.queryByText("ALL LANGUAGES")).not.toBeInTheDocument();
  });

  it("sticks the group headers exactly below the pinned search row", () => {
    renderPicker();
    expand();

    // These two numbers are one measurement, not two constants: the headers stick at the
    // height the search row is pinned to. Asserted so an edit to one has to touch both.
    const search = screen.getByRole("textbox", { name: "Search more languages" });
    const searchRow = search.closest("div");
    const header = screen.getByText("ALL LANGUAGES").closest("div");

    expect(searchRow).toHaveClass("sticky", "top-0", "h-12");
    expect(header).toHaveClass("sticky", "top-12");
  });

  it("sticks the collapsed group at the top, where there is no search row", () => {
    renderPicker();

    // The offset is conditional, so the collapsed branch needs its own assertion:
    // hardcoding top-12 would otherwise leave rows scrolling above a floating header.
    expect(screen.queryByRole("textbox", { name: "Search more languages" })).toBeNull();
    expect(screen.getByText("SUGGESTED LANGUAGES").closest("div")).toHaveClass("sticky", "top-0");
  });
});
