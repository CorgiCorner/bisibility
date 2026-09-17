import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import onboardingMessages from "@/messages/core/en/onboarding.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepConnectProvider } from "./StepConnectProvider";
import {
  clickContinue,
  clickTestConnection,
  push,
  renderProviderStep,
} from "./StepConnectProvider.test-utils";

const polishProviderMessages = mergeMessageCatalogs(sharedMessages, {
  onboarding: {
    ...onboardingMessages.onboarding,
    provider: {
      ...onboardingMessages.onboarding.provider,
      credentials: {
        ...onboardingMessages.onboarding.provider.credentials,
        failed: "Nie udalo sie sprawdzic polaczenia. Sprawdz dane i sprobuj ponownie.",
      },
      errors: {
        ...onboardingMessages.onboarding.provider.errors,
        test: "Nie udalo sie sprawdzic polaczenia z dostawca. Sprobuj ponownie.",
      },
    },
  },
});

describe("StepConnectProvider feedback", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("shows a visible action error when the submit test fails", async () => {
    const onComplete = vi.fn();
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Invalid credentials",
      ok: false,
    }));
    renderProviderStep({
      connectProviderAction,
      onComplete,
      testProviderConnectionAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      await within(screen.getByRole("status")).findByText(
        "Connection test failed. Check the credentials and try again.",
      ),
    ).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText("Save a provider before continuing.")).toBeInTheDocument();
    expect(connectProviderAction).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("localizes a rejected provider result instead of exposing its server message", async () => {
    const testProviderConnectionAction = vi.fn(async () => ({
      message: "upstream credential diagnostic",
      ok: false,
    }));
    renderWithFeatureMessages(
      <StepConnectProvider
        defaultValues={{
          login: "provider-login",
          projectId: "prj_1",
          providerId: "dataforseo",
          secret: "provider-password",
        }}
        testProviderConnectionAction={testProviderConnectionAction}
      />,
      { locale: "pl", messages: polishProviderMessages },
    );

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      await screen.findByText(
        "Nie udalo sie sprawdzic polaczenia. Sprawdz dane i sprobuj ponownie.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("upstream credential diagnostic")).not.toBeInTheDocument();
  });

  it("keeps test progress on the button and the settled slots quiet", async () => {
    let resolveTest: ((result: { message: string; ok: boolean }) => void) | undefined;
    const testProviderConnectionAction = vi.fn(
      async (_input: unknown) =>
        new Promise<{ message: string; ok: boolean }>((resolve) => {
          resolveTest = resolve;
        }),
    );
    const { container } = renderProviderStep({ testProviderConnectionAction });

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(testProviderConnectionAction).toHaveBeenCalledTimes(1));

    const button = screen.getByRole("button", { name: "Test connection" });
    const spinnerSelector = ".bv-spin, [data-spinner]";
    expect(container.querySelectorAll(spinnerSelector)).toHaveLength(1);
    expect(button.querySelectorAll(spinnerSelector)).toHaveLength(1);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Testing...")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await act(async () => resolveTest?.({ message: "Connected", ok: true }));

    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(within(screen.getByRole("status")).getByText("DataForSEO verified")).toBeInTheDocument();
  });

  it("keeps the previous pill result during a retest", async () => {
    let attempt = 0;
    let resolveRetest: ((result: { message: string; ok: boolean }) => void) | undefined;
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => {
      attempt += 1;
      if (attempt === 1) return { message: "Connected", ok: true };
      return new Promise<{ message: string; ok: boolean }>((resolve) => {
        resolveRetest = resolve;
      });
    });
    renderProviderStep({ testProviderConnectionAction });

    await clickTestConnection(testProviderConnectionAction);
    expect(await screen.findByText("Verified")).toBeInTheDocument();

    await clickTestConnection(testProviderConnectionAction, 2);
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.queryByText("Testing...")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await act(async () => resolveRetest?.({ message: "Credentials expired", ok: false }));

    expect(await screen.findByText("Test failed")).toBeInTheDocument();
    expect(
      within(screen.getByRole("status")).getByText(
        "Connection test failed. Check the credentials and try again.",
      ),
    ).toBeInTheDocument();
  });
  it("associates credential errors and announces rejected actions", async () => {
    const testProviderConnectionAction = vi.fn(async () => {
      throw new Error("Provider rejected credentials.");
    });
    renderProviderStep({
      defaultValues: { projectId: "prj_1", providerId: "dataforseo", login: "", secret: "" },
      testProviderConnectionAction,
    });
    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const login = await screen.findByLabelText("API login");
    expect(login).toHaveAttribute("aria-invalid", "true");
    expect(login.getAttribute("aria-describedby")).toMatch(/-error$/);
    const password = screen.getByPlaceholderText("API password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password.getAttribute("aria-describedby")).toMatch(/-error$/);
    fireEvent.change(login, { target: { value: "login" } });
    fireEvent.change(password, { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The provider connection could not be tested. Try again.",
    );
  });

  it("announces a rejected save action", async () => {
    const connectProviderAction = vi.fn(async () => {
      throw new Error("Provider could not be saved.");
    });
    const testProviderConnectionAction = vi.fn(async () => ({ message: "Connected", ok: true }));
    renderProviderStep({ connectProviderAction, testProviderConnectionAction });
    await clickTestConnection(testProviderConnectionAction);
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The provider connection could not be saved. Try again.",
    );
  });
});
