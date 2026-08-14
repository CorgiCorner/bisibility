import { countryValueForCode } from "@/components/keywords/location-picker-data";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketPicker } from "./MarketPicker";

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

function spain() {
  const location = countryValueForCode("ES");
  if (!location) throw new Error("Spain fixture is missing.");
  return location;
}

function showEnglish() {
  fireEvent.click(screen.getByRole("button", { name: "More languages" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search more languages" }), {
    target: { value: "English" },
  });
}

describe("MarketPicker", () => {
  it("commits default and positions-only pairs with canonical identities", async () => {
    const onCommit = vi.fn();
    render(
      <MarketPicker
        initialLocation={spain()}
        onCommit={onCommit}
        projectId="prj_test"
        trackedCanonicalKeys={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Spanish" })).toHaveAttribute("aria-pressed", "true");
    showEnglish();
    const english = screen.getByRole("button", { name: /English.*No search volume/ });
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
    const onCommit = vi.fn();
    render(
      <MarketPicker
        initialLocation={spain()}
        onCommit={onCommit}
        projectId="prj_test"
        trackedCanonicalKeys={["ES"]}
      />,
    );

    expect(screen.getByRole("button", { name: /Spanish.*TRACKED/ })).toBeDisabled();
    expect(screen.getByText("SUGGESTED LANGUAGES")).toHaveStyle({ fontSize: "9px" });
    expect(screen.getByText("TRACKED")).toHaveStyle({ fontSize: "9px" });
    expect(screen.getByRole("button", { name: "Add market" })).toBeDisabled();
    showEnglish();
    fireEvent.click(screen.getByRole("button", { name: /English.*No search volume/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith([expect.objectContaining({ canonicalKey: "ES@en" })]),
    );
  });

  it("clears pending languages when geography changes", () => {
    render(
      <MarketPicker
        initialLocation={spain()}
        onCommit={vi.fn()}
        projectId="prj_test"
        trackedCanonicalKeys={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Catalan/ }));
    expect(screen.getByRole("button", { name: "Add 2" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Change location to Germany" }));

    expect(screen.queryByRole("button", { name: /Catalan/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "German" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Add 1" })).toBeEnabled();
  });
});
