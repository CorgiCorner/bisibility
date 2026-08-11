import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "./OnboardingWizard";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_1",
};

type OnboardingWizardProps = ComponentProps<typeof OnboardingWizard>;
type RenderWizardProps = Omit<Partial<OnboardingWizardProps>, "actions"> & {
  actions?: Partial<OnboardingWizardProps["actions"]>;
};

function renderWizard({ actions: actionOverrides, ...props }: RenderWizardProps = {}) {
  const actions: OnboardingWizardProps["actions"] = {
    addKeywordsAction: vi.fn(async () => ({ created: 0, keywords: [], skippedDuplicates: 0 })),
    completeGooglePropertySelectionAction: vi.fn(async (input) => ({ property: input.property })),
    completeOnboardingAction: vi.fn(async () => ({ completed: true })),
    connectProviderAction: vi.fn(async () => undefined),
    createProjectAction: vi.fn(async () => project),
    getObservedPositionsAction: vi.fn(async () => []),
    fetchRankedKeywordSuggestionsAction: vi.fn(async () => ({ reason: "no_source" as const })),
    importTopQueriesAction: vi.fn(async () => ({ queries: [] })),
    installSampleDataAction: vi.fn(async () => undefined),
    issueApiKeyAction: vi.fn(async () => ({
      maskedValue: "bsb_key_live_******",
      name: "Development",
      raw: "bsb_key_live_secret",
    })),
    listFirstCheckCandidatesAction: vi.fn(async () => ({
      candidates: [],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: false,
    })),
    queueFirstChecksAction: vi.fn(async () => undefined),
    runFirstCheckPreviewAction: vi.fn(async () => ({
      position: null,
      provider: "dataforseo",
      rankingUrl: null,
      status: "completed" as const,
    })),
    saveMatchingScopeAction: vi.fn(async () => undefined),
    syncProjectTrafficAction: vi.fn(async () => undefined),
    testProviderConnectionAction: vi.fn(async () => ({ message: "Connected", ok: true })),
    updateProjectDefaultsAction: vi.fn(async () => undefined),
    ...actionOverrides,
  };

  return render(
    <OnboardingWizard
      actions={actions}
      costPerCheckCents={null}
      dataResidencyMessage=""
      gscJustConnected={false}
      gscOAuthConfigured
      gscPropertyLabel={null}
      hasAnalyticsSource={false}
      initialHasApiKey={false}
      initialFlowState={{ projectId: null, providerId: null }}
      initialKeywordCount={0}
      initialProject={null}
      initialStep={1}
      monthlyCapCents={500}
      providerConnected={false}
      {...props}
    />,
  );
}

describe("OnboardingWizard", () => {
  it("ignores clicks on locked future steps", () => {
    renderWizard();

    expect(
      screen.getByText("Name the project and define what counts as your site."),
    ).toBeInTheDocument();

    const rail = screen.getByLabelText("Onboarding steps");
    const lockedStep = within(rail).getByRole("button", { name: "First check" });
    expect(lockedStep).toBeDisabled();

    fireEvent.click(lockedStep);

    expect(
      screen.getByText("Name the project and define what counts as your site."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Run your first check")).not.toBeInTheDocument();
  });

  it("opens developer access after project creation and allows dashboard-only continuation", () => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 2,
    });

    expect(
      screen.getByRole("heading", { name: "Connect from your terminal or API" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText("Connect your SERP provider")).toBeInTheDocument();
  });

  it("shows nav Skip only on the provider step and clears the provider when clicked", () => {
    renderWizard({
      costPerCheckCents: 25,
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialProject: project,
      initialStep: 2,
      providerConnected: true,
    });

    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    const skipButton = screen.getByRole("button", { name: "Skip" });
    const footer = skipButton.closest("footer");
    expect(skipButton).toHaveAccessibleName("Skip");
    expect(skipButton).toHaveClass("MuiButton-root");
    expect(skipButton).toBeEnabled();
    expect(footer).not.toBeNull();
    expect(
      within(footer as HTMLElement)
        .getAllByRole("button")
        .map((button) => button.textContent?.trim()),
    ).toEqual(["Back", "Skip", "Continue"]);
    fireEvent.click(skipButton);

    expect(screen.getByRole("heading", { name: "Tracking defaults" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Skipped")).toBeInTheDocument();
    expect(window.location.search).toBe("?step=4&projectId=prj_1");
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
  });

  it("keeps provider continue disabled until the current credentials pass a test", async () => {
    const testProviderConnectionAction = vi.fn(async () => ({ message: "Connected", ok: true }));
    renderWizard({
      actions: { testProviderConnectionAction },
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 3,
    });

    const continueButton = screen.getByRole("button", { name: /continue/i });
    const skipButton = screen.getByRole("button", { name: "Skip" });
    expect(continueButton).toBeDisabled();
    expect(skipButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "login" } });
    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "password" } });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(testProviderConnectionAction).toHaveBeenCalledTimes(1));
    expect(continueButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "changed" } });
    expect(continueButton).toBeDisabled();
    expect(skipButton).toBeEnabled();
  });

  it("keeps analytics-only continue enabled and clears provider state after fields change", async () => {
    renderWizard({
      costPerCheckCents: 25,
      hasAnalyticsSource: true,
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 3,
    });

    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "login" } });
    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "changed" } });
    expect(continueButton).toBeEnabled();

    fireEvent.click(continueButton);

    expect(screen.getByRole("heading", { name: "Tracking defaults" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Skipped")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText("Add your first keywords")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("One keyword per line"), {
      target: { value: "rank tracker" },
    });
    expect(screen.queryByText(/\$7\.50\/month/)).not.toBeInTheDocument();
  });

  it("keeps the form submit on step 2 when a provider is already connected", () => {
    renderWizard({
      hasAnalyticsSource: true,
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialProject: project,
      initialStep: 3,
      providerConnected: true,
    });

    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeEnabled();
    // Connected providers must submit through their form; the analytics-only skip
    // path would clear provider state.
    expect(continueButton).toHaveAttribute("type", "submit");
  });

  it("completes onboarding only when the final dashboard action is submitted", async () => {
    const completeOnboardingAction = vi.fn(async () => ({ completed: true }));
    renderWizard({
      actions: { completeOnboardingAction },
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialKeywordCount: 1,
      initialProject: project,
      initialStep: 6,
      providerConnected: true,
    });

    fireEvent.click(screen.getByRole("button", { name: /open dashboard/i }));

    await waitFor(() => expect(completeOnboardingAction).toHaveBeenCalledTimes(1));
    expect(completeOnboardingAction).toHaveBeenCalledWith({ projectId: "prj_1" });
    expect(push).toHaveBeenCalledWith("/app/prj_1/overview");
  });

  it("surfaces a non-blocking warning when Search Console sync fails", async () => {
    const syncProjectTrafficAction = vi.fn(async () => {
      throw new Error("sync failed");
    });
    renderWizard({
      actions: {
        addKeywordsAction: vi.fn(async () => ({
          created: 1,
          keywords: [{ id: "keyword_1", publicId: "kw_1" }],
          skippedDuplicates: 0,
        })),
        syncProjectTrafficAction,
      },
      hasAnalyticsSource: true,
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 5,
    });

    fireEvent.change(screen.getByPlaceholderText("One keyword per line"), {
      target: { value: "rank tracker" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(syncProjectTrafficAction).toHaveBeenCalledWith({ projectId: "prj_1" }),
    );
    expect(
      await screen.findByText(
        "Search Console sync didn't finish - observed data may take a moment. You can retry from Integrations.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "First check" })).toBeInTheDocument();
  });
});
