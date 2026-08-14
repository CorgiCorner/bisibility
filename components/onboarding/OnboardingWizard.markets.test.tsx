import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

vi.mock("@/components/markets/MarketPicker", () => ({
  MarketPicker: ({ onCommit }: { onCommit: (choices: unknown[]) => Promise<void> }) => (
    <button
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
      Add Spain in English
    </button>
  ),
}));

it("keeps draft markets across navigation and persists them on submit", async () => {
  const addKeywordsAction = vi.fn(async () => ({
    created: 1,
    keywords: [{ id: "keyword_1", publicId: "kw_1" }],
    skippedDuplicates: 0,
  }));
  const saveMarketsAction = vi.fn(async (input) => ({ marketKeys: input.marketKeys }));
  renderWizard({
    actions: { addKeywordsAction, saveMarketsAction },
    initialFlowState: { projectId: "prj_1", providerId: null },
    initialProject: project,
    initialStep: 3,
  });

  fireEvent.click(screen.getByRole("button", { name: "Add market" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Spain in English" }));
  expect(saveMarketsAction).not.toHaveBeenCalled();
  const rail = screen.getByLabelText("Onboarding steps");
  fireEvent.click(within(rail).getByRole("button", { name: /Connect data/ }));
  fireEvent.click(within(rail).getByRole("button", { name: /Add keywords/ }));
  fireEvent.change(screen.getByPlaceholderText("One keyword per line"), {
    target: { value: "rank tracker" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));

  await waitFor(() =>
    expect(saveMarketsAction).toHaveBeenCalledWith({
      marketKeys: ["US", "ES@en"],
      projectId: "prj_1",
    }),
  );
  await waitFor(() =>
    expect(addKeywordsAction).toHaveBeenCalledWith(
      expect.objectContaining({ locations: [{ locationKey: "US" }, { locationKey: "ES@en" }] }),
    ),
  );
});
