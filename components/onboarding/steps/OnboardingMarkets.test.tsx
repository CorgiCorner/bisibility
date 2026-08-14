import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingMarkets } from "./OnboardingMarkets";

vi.mock("@/components/markets/MarketPicker", () => ({
  MarketPicker: ({
    maxMarkets,
    onCommit,
    trackedCanonicalKeys,
  }: {
    maxMarkets: number;
    onCommit: (choices: unknown[]) => Promise<void>;
    trackedCanonicalKeys: string[];
  }) => (
    <>
      <output aria-label="Market maximum">{maxMarkets}</output>
      <button
        disabled={trackedCanonicalKeys.includes("ES@en")}
        onClick={() =>
          onCommit([
            {
              canonicalKey: "ES@en",
              countryCode: "ES",
              displayName: "Spain",
              kind: "country",
              language: { code: "en", label: "English" },
              researchAvailable: false,
            },
          ])
        }
        type="button"
      >
        Add English Spain
      </button>
    </>
  ),
}));

describe("OnboardingMarkets", () => {
  it("keeps a drawer addition in the draft until the form is submitted", async () => {
    const onChange = vi.fn();
    const saveMarketsAction = vi.fn(async (input) => ({ marketKeys: input.marketKeys }));
    render(<OnboardingMarkets onChange={onChange} projectId="prj_1" values={[]} />);

    expect(screen.queryByRole("heading", { name: "Add market" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add market" }));
    expect(screen.getByRole("heading", { name: "Add market" })).toBeInTheDocument();
    expect(
      screen.getByText("Pick a location, then the languages to track there."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add English Spain" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ canonicalKey: "ES@en", languageLabel: "English" }),
      ]),
    );
    expect(saveMarketsAction).not.toHaveBeenCalled();
  });

  it("caps the picker at the onboarding market maximum", () => {
    render(<OnboardingMarkets onChange={vi.fn()} projectId="prj_1" values={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add market" }));
    expect(screen.getByLabelText("Market maximum")).toHaveTextContent("5");
  });

  it("keeps the last market and the picker behind the drawer trigger", () => {
    render(
      <OnboardingMarkets
        onChange={vi.fn()}
        projectId="prj_1"
        values={[
          {
            canonicalKey: "ES@en",
            countryCode: "ES",
            displayName: "Spain",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
          },
        ]}
      />,
    );

    expect(screen.queryByLabelText("Market maximum")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Spain / English" })).toBeDisabled();
  });

  it("can re-add a market removed from the current draft", async () => {
    function Harness() {
      const [values, setValues] = useState<LocationFieldValue[]>([
        {
          canonicalKey: "US",
          countryCode: "US",
          displayName: "United States",
          kind: "country" as const,
          languageCode: "en",
          languageLabel: "English",
        },
        {
          canonicalKey: "ES@en",
          countryCode: "ES",
          displayName: "Spain",
          kind: "country" as const,
          languageCode: "en",
          languageLabel: "English",
        },
      ]);
      return <OnboardingMarkets onChange={setValues} projectId="prj_1" values={values} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Spain / English" }));
    expect(screen.queryByText("Spain")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add market" }));
    fireEvent.click(screen.getByRole("button", { name: "Add English Spain" }));
    await waitFor(() => expect(screen.getByText("Spain")).toBeInTheDocument());
  });
});
