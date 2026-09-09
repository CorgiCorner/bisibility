import { deferred } from "@/tests/deferred";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

describe("OnboardingWizard final step", () => {
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
    expect(trigger).toHaveAttribute("data-size", expect.stringMatching(/^(xs|sm)$/));
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Connect a provider" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(dialog).queryByRole("form")).toBeNull();
    expect(within(dialog).queryByText("Provider")).not.toBeInTheDocument();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveAttribute("data-variant", "ghost");
    expect(cancel).toHaveAttribute("data-size", "md");
    expect(cancel).not.toHaveAttribute("data-variant", "secondary");
    expect(within(dialog).getByRole("button", { name: "Test connection" })).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Save connection" });
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
    expect(await screen.findByLabelText("Data source: DataForSEO")).toBeInTheDocument();
    const run = screen.getByRole("button", { name: "Run check" });
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
    const saveButton = within(dialog).getByRole("button", { name: "Save connection" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);
    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledOnce());

    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Close modal" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Connect a provider" })).toBeInTheDocument();

    save.resolve();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByLabelText("Data source: DataForSEO")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Run check" }));
    expect(await screen.findByText(/next run Aug 30, 2026, 08:00/)).toBeInTheDocument();
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
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_1/getting-started");
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
      screen.getByLabelText(
        "Tracking: 1 keyword · Google · United States (English) · Spain (English) · 1 device",
      ),
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

    expect(
      screen.getByLabelText("Tracking: 1 keyword · Google · United States (English) · 1 device"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Data source: SerpApi")).toBeInTheDocument();
    expect(screen.queryByText(/No SERP provider connected/)).toBeNull();
  });
});
