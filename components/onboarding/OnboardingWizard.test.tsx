import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

describe("OnboardingWizard", () => {
  it("hides sample loading without the admin action and keeps normal setup available", () => {
    renderWizard({ actions: { installSampleDataAction: undefined } });
    expect(screen.queryByRole("button", { name: "Load sample project" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore project" })).toBeVisible();
    expect(screen.getByRole("button", { name: /continue/i })).toBeVisible();
  });
  it("prefills the website from the landing signup flow", () => {
    renderWizard({ initialWebsite: "not validated yet & still raw" });

    const input = screen.getByLabelText("Your website");
    expect(input).toHaveAttribute("id", "onboarding-website");
    expect(input).toHaveValue("not validated yet & still raw");
  });
  it("keeps an existing project domain ahead of a landing prefill", () => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialWebsite: "ignored.example",
    });

    expect(screen.getByLabelText("Your website")).toHaveValue("example.com");
  });

  it("ignores clicks on locked future steps", () => {
    renderWizard();

    expect(screen.getByText("Enter the website you want to track.")).toBeInTheDocument();

    const rail = screen.getByLabelText("Onboarding steps");
    for (const name of ["Provider", "Keywords", "First check"]) {
      const lockedStep = within(rail).getByRole("button", { name });
      expect(lockedStep).toBeDisabled();
      fireEvent.click(lockedStep);
    }

    expect(screen.getByText("Enter the website you want to track.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Provider" })).not.toBeInTheDocument();
    expect(screen.queryByText("Run your first check")).not.toBeInTheDocument();
  });

  it("does not let the rail skip create project when a project already exists", () => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: null },
      initialProject: project,
      initialStep: 1,
    });

    const rail = screen.getByLabelText("Onboarding steps");
    const connectData = within(rail).getByRole("button", { name: "Provider" });
    expect(connectData).toBeDisabled();
    fireEvent.click(connectData);

    expect(screen.getByText("Enter the website you want to track.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Provider" })).not.toBeInTheDocument();
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

    expect(screen.getAllByRole("heading", { name: "Provider" })).toHaveLength(2);
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
    expect(skipButton).toHaveAttribute("data-variant", "ghost");
    expect(skipButton).not.toHaveAttribute("data-variant", "secondary");
    expect(screen.getAllByText("Skip for now")).toHaveLength(1);
    const footer = skipButton.closest("footer");
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(footer).not.toBeNull();
    expect(skipButton.parentElement).toBe(continueButton.parentElement);
    expect(skipButton.nextElementSibling).toBe(continueButton);
    expect(getComputedStyle(skipButton).minHeight).toBe(getComputedStyle(continueButton).minHeight);
    expect(getComputedStyle(skipButton).fontSize).toBe(getComputedStyle(continueButton).fontSize);
    expect(screen.getByRole("button", { name: "Provider" })).not.toContainElement(skipButton);
    fireEvent.click(skipButton);

    expect(screen.getAllByRole("heading", { name: "Keywords" })).toHaveLength(2);
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
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
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

    expect(await screen.findAllByRole("heading", { name: "Keywords" })).toHaveLength(2);
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
      name: "Save connection",
    });
    await waitFor(() => expect(saveProvider).toBeEnabled());
    fireEvent.click(saveProvider);
    await screen.findByText("Connected");
    await waitFor(() => expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole("heading", { name: "Keywords" })).toHaveLength(2);
    expect(window.location.search).toBe("?step=3&projectId=prj_1&providerId=dataforseo");

    const rail = screen.getByLabelText("Onboarding steps");
    fireEvent.click(within(rail).getByRole("button", { name: "Provider, completed" }));

    expect(within(rail).getByRole("button", { name: "Keywords" })).toBeDisabled();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText(/Add as fallback \(optional\)/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));
    const saveProviderButton = screen.getByRole("button", {
      name: "Save connection",
    });
    expect(saveProviderButton).toHaveAccessibleName("Save connection");
    expect(saveProviderButton).toBeDisabled();
    expect(screen.getByText("Test the credentials and save.")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeEnabled();
    expect(continueButton).toHaveAttribute("type", "submit");
    fireEvent.click(continueButton);
    expect(await screen.findAllByRole("heading", { name: "Keywords" })).toHaveLength(2);
  });
});
