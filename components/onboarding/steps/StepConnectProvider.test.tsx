import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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

    expect(
      screen.getByText(
        "bisibility does not scrape Google. You connect a data provider (like DataForSEO) with your own API key - a check costs from about $0.002.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /DataForSEO/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /SerpApi/ })).toBeInTheDocument();
    expect(screen.getByLabelText("API login")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Plans include monthly searches. A Top-N check uses up to one search per 10 results, often fewer when a match is found early.",
      }),
    ).toBeInTheDocument();

    const skip = screen.getByRole("link", {
      name: "Skip provider connection and add keywords as paused",
    });
    const providerCards = screen.getByRole("radiogroup", {
      name: "SERP provider",
    });
    expect(skip.compareDocumentPosition(providerCards) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByText("No provider yet?")).not.toBeInTheDocument();
    expect(screen.queryByText(/Search Console can be connected/)).not.toBeInTheDocument();

    const pricing = screen.getByText(/Plan-based - monthly search quota/).parentElement;
    expect(pricing).toHaveClass("mt-2");

    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));

    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.queryByLabelText("API login")).not.toBeInTheDocument();
  });

  it("selects from the whole radio card and then synchronizes the URL", () => {
    window.history.replaceState(null, "", "/onboarding?step=3&projectId=prj_1");
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
    expect(window.location.search).toBe("?step=3&projectId=prj_1&providerId=serpapi");
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
    fireEvent.click(screen.getByRole("button", { name: "Save DataForSEO" }));

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText(/Add as fallback \(optional\)/)).not.toBeInTheDocument();
    expect(screen.getByText("Balance: 12.34")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\b(primary|fallback|backup)\b/i);
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
    fireEvent.click(screen.getByRole("button", { name: "Save DataForSEO" }));
    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "serp-key" },
    });
    const saveButton = screen.getByRole("button", { name: "Save SerpApi" });
    expect(saveButton).toHaveAccessibleName("Save SerpApi");
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveClass("MuiButton-root");
    expect(screen.getByText("Test the credentials, then use Save SerpApi.")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save DataForSEO" }));

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
    const saveButton = screen.getByRole("button", { name: "Save DataForSEO" });
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
    const { container } = renderProviderStep({
      defaultValues: { ...defaultValues(), login: "", secret: "" },
      initialConnections: { dataforseo: {} },
      onComplete,
    });

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Enter your API login.")).not.toBeInTheDocument();
    expect(screen.queryByText("Enter your API password.")).not.toBeInTheDocument();
  });
});
