import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepConnectGscCard } from "./StepConnectGscCard";
import {
  clickContinue,
  clickTestConnection,
  defaultValues,
  push,
  renderProviderStep,
} from "./StepConnectProvider.test-utils";

describe("StepConnectProvider", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("renders provider cards and reveals selected credential fields", () => {
    renderProviderStep();

    expect(screen.getByText("Rank data / powers rank checks")).toBeInTheDocument();
    expect(screen.getByText("Also powers keyword research and difficulty.")).toBeInTheDocument();
    expect(screen.getByText("Rank checks only.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /DataForSEO/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /SerpApi/ })).toBeInTheDocument();
    expect(screen.getByLabelText("API login")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Plans include monthly searches; the free plan has 250. A Top-N check uses up to one search per 10 results, often fewer when a match is found early.",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Skip provider connection and add keywords as paused",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "Skip provider connection and add keywords as paused",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No provider yet?")).not.toBeInTheDocument();
    expect(screen.queryByText(/Search Console can be connected/)).not.toBeInTheDocument();

    const affiliateDisclosure = screen.getByText("· affiliate link");
    const credentialLink = screen.getAllByRole("link", { name: /Get API credentials/ })[0];
    expect(credentialLink).not.toHaveAttribute("title");
    expect(
      credentialLink.compareDocumentPosition(affiliateDisclosure) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(credentialLink).toHaveAttribute("rel", "sponsored noopener noreferrer");

    const pricing = screen.getByText(/Plan-based - monthly search quota/).parentElement;
    expect(pricing).toHaveClass("mt-2");

    expect(screen.getByLabelText("API login").closest(".grid")).toHaveClass("sm:grid-cols-2");
    expect(screen.getByText("Use your API password, not your account password.")).toBeVisible();
    const password = screen.getByLabelText("API password", { exact: true });
    expect(password).toHaveAccessibleName("API password");
    expect(password).toHaveAttribute(
      "aria-describedby",
      "onboarding-dataforseo-secret-description",
    );
    expect(screen.getByRole("button", { name: "Watch setup guide" })).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));

    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.queryByLabelText("API login")).not.toBeInTheDocument();
    expect(screen.getByLabelText("API key").closest(".grid")).not.toHaveClass("sm:grid-cols-2");
  });

  it.each([
    { provider: "DataForSEO", videoId: "QBCtJU5bRAY", field: "API password" },
    { provider: "SerpApi", videoId: "cMSk7FRIzdM", field: "API key" },
  ])(
    "opens the $provider guide without submitting or losing credential drafts",
    async ({ provider, videoId, field }) => {
      const user = userEvent.setup();
      const connectProviderAction = vi.fn();
      const testProviderConnectionAction = vi.fn();
      renderProviderStep({ connectProviderAction, testProviderConnectionAction });
      if (provider === "SerpApi") await user.click(screen.getByRole("radio", { name: /SerpApi/ }));
      const input = screen.getByLabelText(field, { exact: true });
      await user.clear(input);
      await user.type(input, "draft-credential");
      expect(document.querySelector("iframe")).not.toBeInTheDocument();

      const trigger = screen.getByRole("button", { name: "Watch setup guide" });
      await user.click(trigger);
      const modal = screen.getByRole("dialog", { name: `${provider} account setup` });
      expect(modal.querySelector("iframe")).toHaveAttribute(
        "src",
        `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
      );
      expect(modal.querySelector("iframe")).toHaveAccessibleName(`${provider} account setup`);
      if (provider === "DataForSEO")
        expect(within(modal).getByText(/verify your account/)).toBeVisible();
      await user.click(within(modal).getByRole("button", { name: "Close modal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(document.querySelector("iframe")).not.toBeInTheDocument();
      expect(input).toHaveValue("draft-credential");
      expect(trigger).toHaveFocus();
      expect(connectProviderAction).not.toHaveBeenCalled();
      expect(testProviderConnectionAction).not.toHaveBeenCalled();
    },
  );

  it("right-aligns secondary credential actions for both providers", () => {
    renderProviderStep();

    for (const provider of ["DataForSEO", "SerpApi"] as const) {
      if (provider === "SerpApi") fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));
      const testButton = screen.getByRole("button", { name: "Test connection" });
      const saveButton = screen.getByRole("button", { name: "Save connection" });
      const actionGroup = saveButton.parentElement;
      const actionRow = actionGroup?.parentElement;
      expect(testButton).toHaveAttribute("data-variant", "secondary");
      expect(saveButton).toHaveAttribute("data-variant", "secondary");
      expect(actionGroup).toHaveClass("flex", "justify-end");
      expect(actionRow).toHaveClass("flex", "justify-between");
    }
  });

  it("keeps the Search Console option full width in a one-column grid", () => {
    renderProviderStep({
      analyticsOption: <StepConnectGscCard configured={false} />,
    });

    const card = screen.getByText("Search Console").closest("section");
    if (!card) throw new Error("Search Console card was not rendered.");
    const grid = card.parentElement;
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).not.toHaveClass("sm:grid-cols-2");
    expect(card).toHaveClass("w-full");
  });

  it("selects from the whole radio card and then synchronizes the URL", () => {
    window.history.replaceState(null, "", "/onboarding?step=2&projectId=prj_1");
    renderProviderStep({
      flowState: { projectId: "prj_1", providerId: "dataforseo" },
    });

    const dataForSeo = screen.getByRole("radio", { name: /DataForSEO/ });
    const serpApi = screen.getByRole("radio", { name: /SerpApi/ });
    expect(dataForSeo).toBeChecked();
    expect(serpApi).not.toBeChecked();

    expect(serpApi).toHaveClass("absolute", "inset-0");
    fireEvent.click(serpApi);

    expect(serpApi).toBeChecked();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(window.location.search).toBe("?step=2&projectId=prj_1&providerId=serpapi");
  });

  it("marks a successful connection without hierarchy labels or an extra explainer", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      balance: 12.34,
      message: "Connected",
      ok: true,
    }));
    const { container } = renderProviderStep({
      connectProviderAction,
      testProviderConnectionAction,
    });

    await clickTestConnection(testProviderConnectionAction);
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText(/Add as fallback \(optional\)/)).not.toBeInTheDocument();
    expect(screen.getByText("Balance: 12.34")).toBeInTheDocument();
    expect((container.textContent ?? "").replace(/\s+/g, " ").trim()).not.toMatch(
      /\b(primary|fallback|backup)\b/i,
    );
  });

  it("names the additional provider action and keeps it disabled until verified", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Connected",
      ok: true,
    }));
    renderProviderStep({
      connectProviderAction,
      testProviderConnectionAction,
    });

    await clickTestConnection(testProviderConnectionAction);
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "serp-key" },
    });
    const saveButton = screen.getByRole("button", { name: "Save connection" });
    expect(saveButton).toHaveAccessibleName("Save connection");
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveAttribute("data-slot", "button");
    expect(screen.getByText("Test the credentials and save.")).toBeInTheDocument();
    await clickTestConnection(testProviderConnectionAction, 2);
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(2));
    expect(connectProviderAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerId: "serpapi",
      }),
    );
    expect(connectProviderAction.mock.calls[1][0]).not.toHaveProperty("primary");
    expect(connectProviderAction.mock.calls[1][0]).not.toHaveProperty("priority");
  });

  it("keeps a provider's verified test status when switching selection away and back", async () => {
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Connected",
      ok: true,
    }));
    renderProviderStep({ testProviderConnectionAction });

    await clickTestConnection(testProviderConnectionAction);
    expect(
      await within(screen.getByRole("status")).findByText("DataForSEO verified"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("radio", { name: /DataForSEO/ }));
    expect(screen.getByText("DataForSEO verified")).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
  });

  it("keeps Continue disabled until a verified provider is saved", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const onContinueDisabledChange = vi.fn();
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Connected",
      ok: true,
    }));
    renderProviderStep({
      connectProviderAction,
      onContinueDisabledChange,
      testProviderConnectionAction,
    });

    await clickTestConnection(testProviderConnectionAction);
    expect(onContinueDisabledChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));
    expect(onContinueDisabledChange).toHaveBeenLastCalledWith(false);
    expect(connectProviderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        login: "provider-login",
        projectId: "prj_1",
        providerId: "dataforseo",
        secret: "provider-password",
      }),
    );
  });

  it("renders a saved provider connection as connected on load", () => {
    renderProviderStep({ initialConnections: { dataforseo: {} } });

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(
      screen.getByText("Connections are saved per provider - switching does not disconnect."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Saved and encrypted. Leave blank to keep the current value, or enter a new one to replace it.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("API password", { exact: true })).toHaveAccessibleName(
      "API password",
    );
    expect(screen.queryByText("Use your API password, not your account password.")).toBeNull();
  });

  it("marks edited credentials as unsaved until the named provider is tested and saved", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Connected",
      ok: true,
    }));
    renderProviderStep({
      connectProviderAction,
      initialConnections: { dataforseo: {} },
      testProviderConnectionAction,
    });

    expect(screen.getByText("Connected")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("API login"), {
      target: { value: "changed-login" },
    });
    fireEvent.change(screen.getByLabelText("API password"), {
      target: { value: "changed-password" },
    });

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Save connection" });
    expect(saveButton).toBeDisabled();

    await clickTestConnection(testProviderConnectionAction);
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("continues with empty fields when the selected provider is already connected", async () => {
    const onComplete = vi.fn();
    renderProviderStep({
      defaultValues: { ...defaultValues(), login: "", secret: "" },
      initialConnections: { dataforseo: {} },
      onComplete,
    });

    clickContinue();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Enter your API login.")).not.toBeInTheDocument();
    expect(screen.queryByText("Enter your API password.")).not.toBeInTheDocument();
  });
});
