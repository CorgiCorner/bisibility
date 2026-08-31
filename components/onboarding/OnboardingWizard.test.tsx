import { deferred } from "@/tests/deferred";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

describe("OnboardingWizard", () => {
  it("ignores clicks on locked future steps", () => {
    renderWizard();

    expect(screen.getByText("Enter the website you want to track.")).toBeInTheDocument();

    const rail = screen.getByLabelText("Onboarding steps");
    for (const name of ["Connect data", "Add keywords", "First check"]) {
      const lockedStep = within(rail).getByRole("button", { name });
      expect(lockedStep).toBeDisabled();
      fireEvent.click(lockedStep);
    }

    expect(screen.getByText("Enter the website you want to track.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect data" })).not.toBeInTheDocument();
    expect(screen.queryByText("Run your first check")).not.toBeInTheDocument();
  });

  it("does not let the rail skip create project when a project already exists", () => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 1,
    });

    const rail = screen.getByLabelText("Onboarding steps");
    const connectData = within(rail).getByRole("button", { name: "Connect data" });
    expect(connectData).toBeDisabled();
    fireEvent.click(connectData);

    expect(screen.getByText("Enter the website you want to track.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect data" })).not.toBeInTheDocument();
  });

  it("sizes sample and restore actions to the continue control", () => {
    renderWizard();

    const sample = screen.getByRole("button", { name: "Load sample project" });
    const restore = screen.getByRole("button", { name: "Restore project" });
    const continueButton = screen.getByRole("button", { name: /continue/i });
    const footer = sample.closest("footer");

    expect(footer).toHaveClass("items-end");
    expect(getComputedStyle(sample).minHeight).toBe(getComputedStyle(continueButton).minHeight);
    expect(getComputedStyle(restore).minHeight).toBe(getComputedStyle(continueButton).minHeight);
  });

  it("submits step 1 as one website value", async () => {
    const createProjectAction = vi.fn(async (_input: unknown) => project);
    renderWizard({ actions: { createProjectAction } });

    fireEvent.change(screen.getByLabelText("Your website"), {
      target: { value: "https://www.example.com/products" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(1));
    const submittedInput = createProjectAction.mock.calls[0][0] as Record<string, unknown>;
    expect(submittedInput.website).toBe("https://www.example.com/products");
    expect(typeof submittedInput.timezone).toBe("string");
    expect(submittedInput).not.toHaveProperty("includeSubdomains");
    expect(submittedInput).not.toHaveProperty("rootAndWww");
    expect(submittedInput).not.toHaveProperty("urlPrefix");
  });

  it("opens data connections directly after project creation", () => {
    renderWizard({
      gscOAuthConfigured: false,
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 2,
    });

    expect(screen.getByRole("heading", { name: "Connect data" })).toBeInTheDocument();
    expect(screen.getByText("Rank data / powers rank checks")).toBeInTheDocument();
    expect(screen.getByText("Your site's data / optional, free")).toBeInTheDocument();
    expect(screen.getByText("Search Console")).toBeInTheDocument();
    expect(
      screen
        .getByLabelText("API login")
        .compareDocumentPosition(screen.getByText("Your site's data / optional, free")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const siteHeading = screen.getByText("Your site's data / optional, free");
    const oauthNotice = screen.getByRole("alert");
    expect(oauthNotice).toHaveTextContent("GOOGLE_CLIENT_ID");
    expect(
      siteHeading.compareDocumentPosition(oauthNotice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      screen.getByText("Rank data / powers rank checks").compareDocumentPosition(oauthNotice) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByText("Connect from your terminal or API")).not.toBeInTheDocument();
  });

  it("shows one footer Skip for now immediately before Continue and clears the provider", () => {
    renderWizard({
      costPerCheckCents: 25,
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialProject: project,
      initialStep: 2,
      providerConnected: true,
    });

    const skipButton = screen.getByRole("button", {
      name: "Skip provider connection and add keywords as paused",
    });
    expect(skipButton).toHaveTextContent("Skip for now");
    expect(skipButton).toBeEnabled();
    expect(skipButton).toHaveClass("MuiButton-text");
    expect(skipButton).not.toHaveClass("MuiButton-outlined");
    expect(screen.getAllByText("Skip for now")).toHaveLength(1);
    const footer = skipButton.closest("footer");
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(footer).not.toBeNull();
    expect(skipButton.parentElement).toBe(continueButton.parentElement);
    expect(skipButton.nextElementSibling).toBe(continueButton);
    expect(getComputedStyle(skipButton).minHeight).toBe(getComputedStyle(continueButton).minHeight);
    expect(getComputedStyle(skipButton).fontSize).toBe(getComputedStyle(continueButton).fontSize);
    expect(screen.getByRole("button", { name: "Connect data" })).not.toContainElement(skipButton);
    fireEvent.click(skipButton);

    expect(screen.getByRole("heading", { name: "Add your first keywords" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Engine")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?step=3&projectId=prj_1");
    expect(
      screen.queryByRole("button", {
        name: "Skip provider connection and add keywords as paused",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps provider continue disabled until the tested credentials are saved", async () => {
    const testProviderConnectionAction = vi.fn(async () => ({
      message: "Connected",
      ok: true,
    }));
    renderWizard({
      actions: { testProviderConnectionAction },
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 2,
    });

    const continueButton = screen.getByRole("button", { name: /continue/i });
    const skipButton = screen.getByRole("button", {
      name: "Skip provider connection and add keywords as paused",
    });
    expect(continueButton).toBeDisabled();
    expect(skipButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText("API login"), {
      target: { value: "login" },
    });
    fireEvent.change(screen.getByLabelText("API password"), {
      target: { value: "password" },
    });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(testProviderConnectionAction).toHaveBeenCalledTimes(1));
    expect(continueButton).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save DataForSEO" }));
    await waitFor(() => expect(continueButton).toBeEnabled());

    fireEvent.change(screen.getByLabelText("API password"), {
      target: { value: "changed" },
    });
    expect(continueButton).toBeDisabled();
    expect(skipButton).toBeEnabled();
  });

  it("keeps analytics-only continue enabled and clears provider state after fields change", async () => {
    renderWizard({
      costPerCheckCents: 25,
      hasAnalyticsSource: true,
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 2,
    });

    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText("API login"), {
      target: { value: "login" },
    });
    fireEvent.change(screen.getByLabelText("API password"), {
      target: { value: "changed" },
    });
    expect(continueButton).toBeEnabled();

    fireEvent.click(continueButton);

    expect(await screen.findByText("Add your first keywords")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("One keyword per line"), {
      target: { value: "rank tracker" },
    });
    expect(screen.queryByText(/\$7\.50\/month/)).not.toBeInTheDocument();
  });

  it("advances after connecting and exposes another provider only after returning", async () => {
    window.history.replaceState(null, "", "/onboarding?step=2&projectId=prj_1");
    const connectProviderAction = vi.fn(async () => undefined);
    renderWizard({
      actions: { connectProviderAction },
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 2,
    });

    fireEvent.change(screen.getByLabelText("API login"), {
      target: { value: "login" },
    });
    fireEvent.change(screen.getByLabelText("API password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    const saveProvider = await screen.findByRole("button", {
      name: "Save DataForSEO",
    });
    await waitFor(() => expect(saveProvider).toBeEnabled());
    fireEvent.click(saveProvider);
    await screen.findByText("Connected");
    await waitFor(() => expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { name: "Add your first keywords" })).toBeInTheDocument();
    expect(window.location.search).toBe("?step=3&projectId=prj_1&providerId=dataforseo");

    const rail = screen.getByLabelText("Onboarding steps");
    fireEvent.click(within(rail).getByRole("button", { name: "Connect data, completed" }));

    expect(within(rail).getByRole("button", { name: "Add keywords" })).toBeDisabled();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText(/Add as fallback \(optional\)/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));
    const saveProviderButton = screen.getByRole("button", {
      name: "Save SerpApi",
    });
    expect(saveProviderButton).toHaveAccessibleName("Save SerpApi");
    expect(saveProviderButton).toBeDisabled();
    expect(screen.getByText("Test the credentials and save.")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeEnabled();
    expect(continueButton).toHaveAttribute("type", "submit");
    fireEvent.click(continueButton);
    expect(
      await screen.findByRole("heading", { name: "Add your first keywords" }),
    ).toBeInTheDocument();
  });

  it("initializes step 3 Continue as disabled from an empty draft", () => {
    renderWizard({
      initialFlowState: { locations: [], projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 3,
    });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("disables step 3 Continue with no markets and re-enables it after adding one", async () => {
    renderWizard({
      initialFlowState: { locations: ["US"], projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 3,
    });

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove United States / English" }));

    expect(await screen.findByText("Add at least one market to continue.")).toBeInTheDocument();
    expect(continueButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add market" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Add market" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));

    await waitFor(() => expect(continueButton).toBeEnabled());
    expect(screen.queryByText("Add at least one market to continue.")).not.toBeInTheDocument();
  });

  it("connects a provider in the final-step modal and focuses the enabled test action", async () => {
    const connectProviderAction = vi.fn(async () => undefined);
    const completeOnboardingAction = vi.fn(async () => ({ completed: true }));
    renderWizard({
      actions: { connectProviderAction, completeOnboardingAction },
      costPerCheckCents: null,
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialKeywordCount: 1,
      initialKeywordText: "rank tracker",
      initialProject: project,
      initialStep: 4,
      providerConnected: false,
    });
    const trigger = screen.getByRole("button", { name: "Connect" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
    expect(trigger).toHaveClass("MuiButton-sizeSmall");
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Connect a provider" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(dialog).queryByRole("form")).toBeNull();
    expect(within(dialog).queryByText("Connect data")).not.toBeInTheDocument();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveClass("MuiButton-text", "MuiButton-sizeMedium");
    expect(cancel).not.toHaveClass("MuiButton-outlined");
    expect(within(dialog).getByRole("button", { name: "Test connection" })).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Save DataForSEO" });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("API login"), { target: { value: "login" } });
    fireEvent.change(within(dialog).getByLabelText("API password"), {
      target: { value: "password" },
    });
    fireEvent.keyDown(within(dialog).getByLabelText("API password"), { key: "Enter" });
    expect(completeOnboardingAction).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(/DataForSEO · estimated rate unavailable/)).toBeInTheDocument();
    const run = screen.getByRole("button", { name: "Run a test check (1 keyword)" });
    expect(run).toBeEnabled();
    expect(run).toHaveFocus();
  });

  it("keeps the provider modal open while save is in flight, then completes once", async () => {
    const save = deferred<void>();
    const connectProviderAction = vi.fn(() => save.promise);
    renderWizard({
      actions: { connectProviderAction },
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialKeywordCount: 1,
      initialKeywordText: "rank tracker",
      initialProject: project,
      initialStep: 4,
      providerConnected: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const dialog = await screen.findByRole("dialog", { name: "Connect a provider" });
    fireEvent.change(within(dialog).getByLabelText("API login"), { target: { value: "login" } });
    fireEvent.change(within(dialog).getByLabelText("API password"), {
      target: { value: "password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Test connection" }));
    const saveButton = within(dialog).getByRole("button", { name: "Save DataForSEO" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);
    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledOnce());

    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Close modal" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Connect a provider" })).toBeInTheDocument();

    save.resolve();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(/DataForSEO · estimated rate unavailable/)).toBeInTheDocument();
  });

  it("keeps Step 4 provider selection on the final-step URL", async () => {
    window.history.replaceState(null, "", "/onboarding?step=4&projectId=prj_1");
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialKeywordCount: 1,
      initialProject: project,
      initialStep: 4,
      providerConnected: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const dialog = await screen.findByRole("dialog", { name: "Connect a provider" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /SerpApi/ }));
    expect(window.location.search).toBe("?step=4&projectId=prj_1");
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it.each(["Cancel", "Close modal"])("returns focus to Connect after %s", async (name) => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialKeywordCount: 1,
      initialKeywordText: "rank tracker",
      initialProject: project,
      initialStep: 4,
      providerConnected: false,
    });
    const trigger = screen.getByRole("button", { name: "Connect" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("returns focus to Connect after Escape", async () => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialKeywordCount: 1,
      initialKeywordText: "rank tracker",
      initialProject: project,
      initialStep: 4,
      providerConnected: false,
    });
    const trigger = screen.getByRole("button", { name: "Connect" });
    fireEvent.click(trigger);
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("uses the authoritative next dispatch returned after a timezone save", async () => {
    const updateProjectDefaultsAction = vi.fn(async () => ({
      nextCheckAt: "2026-08-30T06:00:00.000Z",
    }));
    renderWizard({
      actions: {
        listFirstCheckCandidatesAction: vi.fn(async () => ({
          candidates: [
            {
              device: "desktop" as const,
              id: "keyword_1",
              market: { languageLabel: "English", locationLabel: "United States" },
              publicId: "kw_keyword_1",
              text: "rank tracker",
            },
          ],
          hasAnalyticsSource: false,
          isSampleProject: false,
          providerReady: true,
        })),
        updateProjectDefaultsAction,
      },
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialKeywordCount: 1,
      initialKeywordText: "rank tracker",
      initialProject: { ...project, frequency: "daily", timezone: "UTC" },
      initialStep: 4,
      nextCheckAt: "2026-08-29T06:00:00.000Z",
      providerConnected: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Project timezone" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Europe\/Warsaw/ }));
    await waitFor(() => expect(updateProjectDefaultsAction).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Run a test check (1 keyword)" }));
    expect(await screen.findByText(/next run Aug 30, 2026, 8:00 AM/)).toBeInTheDocument();
    expect(screen.queryByText(/Aug 29, 2026/)).not.toBeInTheDocument();
  }, 20_000);

  it("completes onboarding only when the final dashboard action is submitted", async () => {
    const completeOnboardingAction = vi.fn(async () => ({ completed: true }));
    renderWizard({
      actions: { completeOnboardingAction },
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialKeywordCount: 1,
      initialKeywordText: "rank tracker",
      initialProject: project,
      initialStep: 4,
      providerConnected: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Open app" }));

    await waitFor(() => expect(completeOnboardingAction).toHaveBeenCalledTimes(1));
    expect(completeOnboardingAction).toHaveBeenCalledWith({
      projectId: "prj_1",
    });
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_1/dashboard");
  });

  it("renders and saves hydrated registry markets on a resumed final step", async () => {
    const saveMarketsAction = vi.fn(async (input) => ({ marketKeys: input.marketKeys }));
    renderWizard({
      actions: { saveMarketsAction },
      initialFlowState: {
        locations: ["US", "ES@en"],
        projectId: "prj_1",
        providerId: "dataforseo",
      },
      initialKeywordCount: 1,
      initialKeywordText: "rank tracker",
      initialProject: project,
      initialStep: 4,
      providerConnected: true,
    });

    expect(
      screen.getByLabelText(/Markets: United States \/ English · Spain \/ English/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open app" }));

    await waitFor(() =>
      expect(saveMarketsAction).toHaveBeenCalledWith({
        marketKeys: ["US", "ES@en"],
        projectId: "prj_1",
      }),
    );
  });

  it("recognizes a saved SerpApi connection on the first-check step", () => {
    renderWizard({
      hasAnalyticsSource: true,
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialKeywordCount: 1,
      initialProject: project,
      initialSerpConnections: { serpapi: {} },
      initialStep: 4,
      providerConnected: false,
    });

    expect(screen.getByText("1 sample check - one per market and device")).toBeInTheDocument();
    expect(screen.getByText(/SerpApi · estimated rate unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/No SERP provider connected/)).toBeNull();
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
    expect(screen.getByRole("heading", { name: "First check" })).toBeInTheDocument();
  });
});
