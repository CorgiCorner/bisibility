import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepConnectProvider } from "./StepConnectProvider";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function defaultValues() {
  return {
    login: "provider-login",
    projectId: "prj_1",
    providerId: "dataforseo" as const,
    secret: "provider-password",
  };
}

function renderProviderStep(props: Partial<ComponentProps<typeof StepConnectProvider>> = {}) {
  return render(<StepConnectProvider defaultValues={defaultValues()} {...props} />);
}

async function clickTestConnection(action: ReturnType<typeof vi.fn>, times = 1) {
  fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(times));
}

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

    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));

    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.queryByLabelText("API login")).not.toBeInTheDocument();
  });

  it("selects from the whole radio card and then synchronizes the URL", () => {
    window.history.replaceState(null, "", "/onboarding?step=3&projectId=prj_1");
    renderProviderStep({ flowState: { projectId: "prj_1", providerId: "dataforseo" } });

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

  it("shows a visible action error when the submit test fails", async () => {
    const onComplete = vi.fn();
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Invalid credentials",
      ok: false,
    }));
    const { container } = renderProviderStep({
      connectProviderAction,
      onComplete,
      testProviderConnectionAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      await within(screen.getByRole("status")).findByText("Invalid credentials"),
    ).toBeInTheDocument();
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("Test connection before continuing.")).toBeInTheDocument();
    expect(connectProviderAction).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("marks a successful primary connection and reveals the backup CTA", async () => {
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
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("Connected (primary)")).toBeInTheDocument();
    expect(screen.getByText(/Add as fallback \(optional\)/)).toBeInTheDocument();
    expect(screen.getByText("Balance: 12.34")).toBeInTheDocument();
  });

  it("keeps the fallback Connect backup action accessible and disabled until verified", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Connected",
      ok: true,
    }));
    const { container } = renderProviderStep({
      connectProviderAction,
      testProviderConnectionAction,
    });

    await clickTestConnection(testProviderConnectionAction);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "serp-key" },
    });
    const connectButton = screen.getByRole("button", { name: "Connect backup" });
    expect(connectButton).toHaveAccessibleName("Connect backup");
    expect(connectButton).toBeDisabled();
    expect(connectButton).toHaveClass("MuiButton-root");
    expect(
      screen.getByText("Test validates the key - use Connect backup to save it."),
    ).toBeInTheDocument();
    await clickTestConnection(testProviderConnectionAction, 2);
    expect(connectButton).toBeEnabled();
    fireEvent.click(connectButton);

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

  it("continues with a verified provider draft after selecting an unverified provider", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const onContinueDisabledChange = vi.fn();
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Connected",
      ok: true,
    }));
    const { container } = renderProviderStep({
      connectProviderAction,
      onContinueDisabledChange,
      testProviderConnectionAction,
    });

    await clickTestConnection(testProviderConnectionAction);
    fireEvent.click(screen.getByRole("radio", { name: /SerpApi/ }));

    expect(onContinueDisabledChange).toHaveBeenLastCalledWith(false);

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));
    expect(connectProviderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        login: "provider-login",
        projectId: "prj_1",
        providerId: "dataforseo",
        secret: "provider-password",
      }),
    );
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
    const spinnerSelector = ".bv-spin, .MuiCircularProgress-root";
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
    expect(within(screen.getByRole("status")).getByText("Credentials expired")).toBeInTheDocument();
  });

  it("renders a saved provider connection as connected on load", () => {
    renderProviderStep({ initialConnections: { dataforseo: { primary: true } } });

    expect(screen.getByText("Connected (primary)")).toBeInTheDocument();
    expect(
      screen.getByText("Connections are saved per provider - switching does not disconnect."),
    ).toBeInTheDocument();
  });

  it("continues with empty fields when the selected provider is already connected", async () => {
    const onComplete = vi.fn();
    const { container } = renderProviderStep({
      defaultValues: { ...defaultValues(), login: "", secret: "" },
      initialConnections: { dataforseo: { primary: true } },
      onComplete,
    });

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Enter your API login.")).not.toBeInTheDocument();
    expect(screen.queryByText("Enter your API password.")).not.toBeInTheDocument();
  });
});
