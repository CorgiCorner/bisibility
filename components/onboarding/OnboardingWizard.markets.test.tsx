import type { NewMarketCreateInput } from "@/lib/markets/create-input";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

it("creates a draft market through the shared drawer, keeps it across navigation and persists it on submit", async () => {
  const projectId = `prj_${"a".repeat(24)}`;
  const user = userEvent.setup();
  const actions = {
    addKeywordsAction: vi.fn(async () => ({
      created: 1,
      persistedKeywordCount: 1,
      keywords: [{ id: "keyword_1", publicId: "kw_1" }],
      skippedDuplicates: 0,
    })),
    createMarketAction: vi.fn(async (input: NewMarketCreateInput) => ({
      canonicalKey: input.canonicalKey,
      countryCode: input.countryCode,
      displayName: "Spain",
      keywordCount: 0,
      kind: input.kind,
      languageCode: input.languageCode,
      languageLabel: "English",
      publicId: `pmkt_${"a".repeat(24)}`,
    })),
    saveMarketsAction: vi.fn(async (input: { marketKeys: string[] }) => ({
      marketKeys: input.marketKeys,
    })),
  };
  renderWizard({
    actions,
    initialFlowState: { projectId, providerId: null },
    initialProject: { ...project, publicId: projectId },
    initialStep: 3,
  });

  expect(screen.queryByRole("button", { name: "New market" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Another market" }));
  await user.click(screen.getByRole("button", { name: "Country" }));
  await user.type(screen.getByRole("textbox", { name: "Search countries" }), "Spain");
  await user.click(await screen.findByRole("menuitem", { name: "Spain" }));
  await user.click(screen.getByRole("button", { name: "Language" }));
  await user.type(screen.getByRole("textbox", { name: "Search all languages" }), "engl");
  await user.click(screen.getByRole("menuitem", { name: "English" }));
  await user.click(screen.getByRole("button", { name: "Location" }));
  await user.click(screen.getByRole("menuitem", { name: "Spain (Country)" }));
  await user.click(screen.getByRole("button", { name: "Create market" }));

  await waitFor(() =>
    expect(actions.createMarketAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalKey: "ES@en",
        countryCode: "ES",
        kind: "country",
        languageCode: "en",
        method: { kind: "empty" },
        name: "",
        projectId,
        schedule: null,
      }),
    ),
  );
  expect(await screen.findByRole("button", { name: "Remove Spain / English" })).toBeVisible();
  expect(actions.saveMarketsAction).not.toHaveBeenCalled();
  expect(actions.addKeywordsAction).not.toHaveBeenCalled();

  const rail = screen.getByLabelText("Onboarding steps");
  fireEvent.click(within(rail).getByRole("button", { name: /Provider/ }));
  // The rail no longer jumps forward past the current step, so returning to the keywords
  // step goes through this step's own Skip, which is the path a user has.
  fireEvent.click(
    screen.getByRole("button", { name: "Skip provider connection and add keywords as paused" }),
  );
  expect(screen.getByRole("button", { name: "Remove Spain / English" })).toBeVisible();
  fireEvent.change(screen.getByPlaceholderText("One keyword per line"), {
    target: { value: "rank tracker" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));

  await waitFor(() =>
    expect(actions.saveMarketsAction).toHaveBeenCalledWith({
      marketKeys: ["US", "ES@en"],
      projectId,
    }),
  );
  await waitFor(() =>
    expect(actions.addKeywordsAction).toHaveBeenCalledWith(
      expect.objectContaining({ locations: [{ locationKey: "US" }, { locationKey: "ES@en" }] }),
    ),
  );
  expect(actions.createMarketAction).toHaveBeenCalledTimes(1);
}, 10_000);
