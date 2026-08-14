import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

describe("OnboardingWizard", () => {
  it("ignores clicks on locked future steps", () => {
    renderWizard();

    expect(screen.getByText("Enter the website you want to track.")).toBeInTheDocument();

    const rail = screen.getByLabelText("Onboarding steps");
    const lockedStep = within(rail).getByRole("button", {
      name: "First check",
    });
    expect(lockedStep).toBeDisabled();

    fireEvent.click(lockedStep);

    expect(screen.getByText("Enter the website you want to track.")).toBeInTheDocument();
    expect(screen.queryByText("Run your first check")).not.toBeInTheDocument();
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
    expect(screen.queryByText("Connect from your terminal or API")).not.toBeInTheDocument();
  });

  it("shows one top Skip only on the provider step and clears the provider when clicked", () => {
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
    expect(skipButton).toHaveTextContent("Skip");
    expect(skipButton).toBeEnabled();
    expect(screen.getAllByText("Skip")).toHaveLength(1);
    expect(skipButton.closest("footer")).toBeNull();
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

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText(/Add as fallback \(optional\)/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));
    const saveProviderButton = screen.getByRole("button", {
      name: "Save SerpApi",
    });
    expect(saveProviderButton).toHaveAccessibleName("Save SerpApi");
    expect(saveProviderButton).toBeDisabled();
    expect(screen.getByText("Test the credentials, then use Save SerpApi.")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeEnabled();
    expect(continueButton).toHaveAttribute("type", "submit");
    fireEvent.click(continueButton);
    expect(
      await screen.findByRole("heading", { name: "Add your first keywords" }),
    ).toBeInTheDocument();
  });

  it("completes onboarding only when the final dashboard action is submitted", async () => {
    const completeOnboardingAction = vi.fn(async () => ({ completed: true }));
    renderWizard({
      actions: { completeOnboardingAction },
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialKeywordCount: 1,
      initialProject: project,
      initialStep: 4,
      providerConnected: true,
    });

    fireEvent.click(screen.getByRole("button", { name: /open dashboard/i }));

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
      initialProject: project,
      initialStep: 4,
      providerConnected: true,
    });

    expect(screen.getByText("United States")).toBeInTheDocument();
    expect(screen.getByText("Spain")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));

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
    expect(screen.getByText("SerpApi")).toBeInTheDocument();
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
