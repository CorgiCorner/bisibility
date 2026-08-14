import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepConnectProvider } from "./StepConnectProvider";
import {
  clickContinue,
  clickTestConnection,
  defaultValues,
  renderProviderStep,
} from "./StepConnectProvider.test-utils";

describe("StepConnectProvider submission", () => {
  it("exposes one selected provider through the radiogroup", () => {
    renderProviderStep({ initialConnections: { dataforseo: {} } });

    const group = screen.getByRole("radiogroup", { name: "SERP provider" });
    const dataForSeo = within(group).getByRole("radio", { name: /DataForSEO/ });
    const serpApi = within(group).getByRole("radio", { name: /SerpApi/ });
    expect(
      within(group)
        .getAllByRole("radio")
        .filter((radio) => radio.matches(":checked")),
    ).toEqual([dataForSeo]);
    expect(dataForSeo.closest("section")).toHaveClass("border-accent", "bg-accent-soft");

    fireEvent.click(serpApi);

    expect(
      within(group)
        .getAllByRole("radio")
        .filter((radio) => radio.matches(":checked")),
    ).toEqual([serpApi]);
    expect(serpApi.closest("section")).toHaveClass("border-accent", "bg-accent-soft");
    expect(dataForSeo.closest("section")).not.toHaveClass("border-accent", "bg-accent-soft");
  });

  it("keeps compact provider status pills below the title hierarchy", async () => {
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Connected",
      ok: true,
    }));
    renderProviderStep({ testProviderConnectionAction });

    for (const status of screen.getAllByText("Not connected")) {
      expect(status.closest("span")).toHaveClass("h-5");
    }
    await clickTestConnection(testProviderConnectionAction);
    expect((await screen.findByText("Verified")).closest("span")).toHaveClass("h-5");
  });

  it("uses the same regular label weight for test and save actions", () => {
    renderProviderStep();

    expect(
      getComputedStyle(screen.getByRole("button", { name: "Test connection" })).fontWeight,
    ).toBe(getComputedStyle(screen.getByRole("button", { name: "Save DataForSEO" })).fontWeight);
  });

  it("still rejects empty fields when the selected provider is not connected", async () => {
    const onComplete = vi.fn();
    renderProviderStep({
      defaultValues: { ...defaultValues(), login: "", secret: "" },
      onComplete,
    });

    clickContinue();

    expect(await screen.findByText("Enter your API login.")).toBeInTheDocument();
    expect(screen.getByText("Enter your API password.")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("keeps the skip affordance on the paused-keywords path", () => {
    renderProviderStep({ flowState: { projectId: "prj_1" } });

    expect(
      screen.getByRole("link", {
        name: "Skip provider connection and add keywords as paused",
      }),
    ).toHaveAttribute("href", "/onboarding?step=3&projectId=prj_1");
    expect(
      screen.getByRole("link", {
        name: "Skip provider connection and add keywords as paused",
      }),
    ).toHaveStyle({ minHeight: "30px", padding: "4px 10px" });
  });

  it("submits no client-owned enabled, primary, or priority to the provider action", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "ok",
      ok: true,
    }));
    render(
      <StepConnectProvider
        connectProviderAction={connectProviderAction}
        defaultValues={defaultValues()}
        testProviderConnectionAction={testProviderConnectionAction}
      />,
    );

    await clickTestConnection(testProviderConnectionAction);
    fireEvent.click(screen.getByRole("button", { name: "Save DataForSEO" }));

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));
    const connectInput = connectProviderAction.mock.calls[0][0] as Record<string, unknown>;
    expect(connectInput).toEqual(
      expect.objectContaining({
        costPerCheck: undefined,
        projectId: "prj_1",
        providerId: "dataforseo",
      }),
    );
    expect(connectInput).not.toHaveProperty("enabled");
    expect(connectInput).not.toHaveProperty("primary");
    expect(connectInput).not.toHaveProperty("priority");
    expect(testProviderConnectionAction).toHaveBeenCalledWith(
      expect.not.objectContaining({
        enabled: true,
        primary: true,
        priority: 0,
      }),
    );
    expect(screen.getByText("Connect data")).toBeInTheDocument();
  });

  it("submits SerpApi from onboarding as an API key credential", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "ok",
      ok: true,
    }));
    render(
      <StepConnectProvider
        connectProviderAction={connectProviderAction}
        defaultValues={{
          ...defaultValues(),
          login: "stale-login",
          providerId: "serpapi",
          secret: "serp-key",
        }}
        testProviderConnectionAction={testProviderConnectionAction}
      />,
    );

    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.queryByLabelText("API login")).not.toBeInTheDocument();

    await clickTestConnection(testProviderConnectionAction);
    fireEvent.click(screen.getByRole("button", { name: "Save SerpApi" }));

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));
    const connectInput = connectProviderAction.mock.calls[0][0] as Record<string, unknown>;
    expect(connectInput).toEqual(
      expect.objectContaining({
        credentials: { apiKey: "serp-key" },
        providerId: "serpapi",
      }),
    );
    expect(connectInput.login).toBeUndefined();
    expect(connectInput.secret).toBeUndefined();
    expect(testProviderConnectionAction).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { apiKey: "serp-key" },
        providerId: "serpapi",
      }),
    );
  });

  it("invalidates a successful test when onboarding credentials change", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const onContinueDisabledChange = vi.fn();
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "ok",
      ok: true,
    }));
    renderProviderStep({
      connectProviderAction,
      onContinueDisabledChange,
      testProviderConnectionAction,
    });

    await clickTestConnection(testProviderConnectionAction);
    expect(onContinueDisabledChange).toHaveBeenLastCalledWith(true);

    fireEvent.change(screen.getByLabelText("API password"), {
      target: { value: "changed-password" },
    });
    expect(onContinueDisabledChange).toHaveBeenLastCalledWith(true);

    clickContinue();

    expect(await screen.findByText("Save a provider before continuing.")).toBeInTheDocument();
    expect(connectProviderAction).not.toHaveBeenCalled();
  });

  it("toggles API password visibility", () => {
    renderProviderStep();

    const passwordInput = screen.getByLabelText("API password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");
    expect(passwordInput).toHaveAttribute("placeholder", "API password");
    expect(passwordInput).toHaveClass("truncate", "pr-12");

    const revealButton = screen.getByRole("button", { name: "Show password" });
    expect(revealButton).toHaveAccessibleName("Show password");
    expect(revealButton).toHaveClass("h-8", "w-8");
    fireEvent.click(revealButton);
    expect(passwordInput.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput.type).toBe("password");
  });
});
