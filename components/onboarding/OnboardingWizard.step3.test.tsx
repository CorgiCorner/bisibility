import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

describe("OnboardingWizard keyword step", () => {
  it("initializes step 3 Continue as disabled from an empty draft", () => {
    renderWizard({
      initialFlowState: { locations: [], projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 3,
    });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("disables step 3 Continue with no markets and re-enables it after adding one", async () => {
    const user = userEvent.setup();
    const projectId = `prj_${"a".repeat(24)}`;
    renderWizard({
      initialFlowState: { locations: ["US"], projectId, providerId: null },
      initialProject: { ...project, publicId: projectId },
      initialStep: 3,
    });

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove United States / English" }));

    expect(await screen.findByText("Add at least one market to continue.")).toBeInTheDocument();
    expect(continueButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Country" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add market" }));
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "Spain");
    await user.click(await screen.findByRole("menuitem", { name: "Spain" }));
    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("menuitem", { name: "Spanish" }));
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.click(screen.getByRole("menuitem", { name: "Spain (Country)" }));
    await user.click(screen.getByRole("button", { name: "Create market" }));

    await waitFor(() => expect(continueButton).toBeEnabled());
    expect(screen.getByRole("button", { name: "Remove Spain / Spanish" })).toBeVisible();
    expect(screen.queryByText("Add at least one market to continue.")).not.toBeInTheDocument();
  });

  it("restores keywords after refresh and keeps completed checks after Back and Continue", async () => {
    const saved = {
      id: "keyword_1",
      publicId: "kw_1",
      text: "rank tracker",
      device: "mobile" as const,
      market: { locationLabel: "United States", languageLabel: "English" },
      previousResult: {
        status: "completed" as const,
        position: null,
        provider: "dataforseo",
        requestedDepth: 50,
        rankingUrl: null,
        recordedCostCents: 0.8,
      },
    };
    const list = vi.fn(async () => ({
      candidates: [saved],
      providerReady: true,
      isSampleProject: false,
      hasAnalyticsSource: false,
    }));
    let finishLoading!: () => void;
    const pendingCandidates = new Promise<void>((resolve) => {
      finishLoading = resolve;
    });
    list.mockImplementationOnce(async () => {
      await pendingCandidates;
      return {
        candidates: [saved],
        providerReady: true,
        isSampleProject: false,
        hasAnalyticsSource: false,
      };
    });
    const run = vi.fn();
    renderWizard({
      initialProject: { ...project, frequency: "daily", serpDepth: 50 },
      initialFlowState: {
        projectId: "prj_1",
        locations: ["US"],
        devices: ["mobile"],
        providerId: "dataforseo",
      },
      initialKeywordCount: 2,
      initialKeywordText: "rank tracker",
      initialKeywordDraft: "rank tracker\nseo api",
      initialStep: 3,
      providerConnected: true,
      actions: {
        listFirstCheckCandidatesAction: list,
        runFirstCheckPreviewAction: run,
        addKeywordsAction: vi.fn(async () => ({
          created: 0,
          persistedKeywordCount: 2,
          keywords: [],
          skippedDuplicates: 2,
        })),
      },
    });
    expect(screen.getByPlaceholderText("One keyword per line")).toHaveValue(
      "rank tracker\nseo api",
    );
    expect(screen.getByText("2 unique keywords")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    const saving = screen.getByRole("button", { name: "Saving keywords..." });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.queryByText(/added, .*already tracked|Saving setup/)).not.toBeInTheDocument();
    await act(async () => {
      finishLoading();
    });
    expect(await screen.findByText("Not in top 50")).toBeInTheDocument();
    expect(
      screen.getByText(/Your 2 keywords run automatically on your daily schedule/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Optional: check 1 keyword now/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByPlaceholderText("One keyword per line")).toHaveValue(
      "rank tracker\nseo api",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Not in top 50")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "View dashboard" })).toBeInTheDocument();
  });

  it("surfaces a non-blocking warning when Search Console sync fails", async () => {
    const syncProjectTrafficAction = vi.fn(async () => {
      throw new Error("sync failed");
    });
    renderWizard({
      actions: {
        addKeywordsAction: vi.fn(async () => ({
          created: 1,
          persistedKeywordCount: 1,
          keywords: [{ id: "keyword_1", publicId: "kw_1" }],
          skippedDuplicates: 0,
        })),
        syncProjectTrafficAction,
      },
      hasAnalyticsSource: true,
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 3,
    });

    fireEvent.change(screen.getByPlaceholderText("One keyword per line"), {
      target: { value: "rank tracker" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(syncProjectTrafficAction).toHaveBeenCalledWith({
        projectId: "prj_1",
      }),
    );
    expect(
      await screen.findByText(
        "Search Console sync didn't finish - observed data may take a moment. You can retry from Integrations.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "First check" })).toHaveLength(2);
  });
});
