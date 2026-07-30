import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepConnectProvider } from "./StepConnectProvider";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function defaultValues() {
  return {
    enabled: true,
    login: "provider-login",
    primary: true,
    priority: 25,
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

    expect(screen.getByRole("button", { name: /DataForSEO/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SerpApi/ })).toBeInTheDocument();
    expect(screen.getByLabelText("API login")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /SerpApi/ }));

    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.queryByLabelText("API login")).not.toBeInTheDocument();
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

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
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
    expect(screen.getByText(/Add as backup \(optional\)/)).toBeInTheDocument();
    expect(screen.getByText("Balance: 12.34")).toBeInTheDocument();
  });

  it("connects the backup as non-primary priority one", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: /SerpApi/ }));
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "serp-key" },
    });
    await clickTestConnection(testProviderConnectionAction, 2);
    fireEvent.click(screen.getByRole("button", { name: "Connect backup" }));

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(2));
    expect(connectProviderAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        primary: false,
        priority: 1,
        providerId: "serpapi",
      }),
    );
  });

  it("keeps a provider's verified test status when switching selection away and back", async () => {
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Connected",
      ok: true,
    }));
    renderProviderStep({ testProviderConnectionAction });

    await clickTestConnection(testProviderConnectionAction);
    expect(await screen.findByText("DataForSEO connected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /SerpApi/ }));
    expect(screen.getByText("Not tested yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /DataForSEO/ }));
    expect(screen.getByText("DataForSEO connected")).toBeInTheDocument();
    expect(screen.queryByText("Not tested yet")).not.toBeInTheDocument();
  });

  it("renders a saved provider connection as connected on load", () => {
    renderProviderStep({ initialConnections: { dataforseo: { primary: true } } });

    expect(screen.getByText("Connected (primary)")).toBeInTheDocument();
    expect(
      screen.getByText("Connections are saved per provider - switching does not disconnect."),
    ).toBeInTheDocument();
  });

  it("keeps the skip affordance on the paused-keywords path", () => {
    renderProviderStep({ flowState: { projectId: "prj_1" } });

    expect(screen.getByRole("link", { name: "Skip, add keywords as paused" })).toHaveAttribute(
      "href",
      "/onboarding?step=4&projectId=prj_1",
    );
  });

  it("submits enabled and primary priority to the provider action", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "ok",
      ok: true,
    }));
    const { container } = render(
      <StepConnectProvider
        connectProviderAction={connectProviderAction}
        defaultValues={defaultValues()}
        testProviderConnectionAction={testProviderConnectionAction}
      />,
    );

    await clickTestConnection(testProviderConnectionAction);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(connectProviderAction).toHaveBeenCalledTimes(1));
    expect(connectProviderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        costPerCheck: undefined,
        enabled: true,
        primary: true,
        priority: 0,
        projectId: "prj_1",
        providerId: "dataforseo",
      }),
    );
    expect(testProviderConnectionAction).toHaveBeenCalledWith(
      expect.not.objectContaining({ enabled: true, priority: 25 }),
    );
    expect(screen.getByText("Connect your SERP provider")).toBeInTheDocument();
  });

  it("submits SerpApi from onboarding as an API key credential", async () => {
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "ok",
      ok: true,
    }));
    const { container } = render(
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
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

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
    const { container } = renderProviderStep({
      connectProviderAction,
      onContinueDisabledChange,
      testProviderConnectionAction,
    });

    await clickTestConnection(testProviderConnectionAction);
    expect(onContinueDisabledChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByLabelText("API password"), {
      target: { value: "changed-password" },
    });
    expect(onContinueDisabledChange).toHaveBeenLastCalledWith(true);

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("Test connection before continuing.")).toBeInTheDocument();
    expect(connectProviderAction).not.toHaveBeenCalled();
  });

  it("toggles API password visibility", () => {
    renderProviderStep();

    const passwordInput = screen.getByLabelText("API password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput.type).toBe("password");
  });
});
