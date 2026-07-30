import { providerCredentialFieldsFor } from "@/lib/integrations/credential-fields";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectDrawer } from "./ConnectDrawer";
import { ActionNotice, ActivityList, ConnectionOkBanner, EnvHint } from "./ConnectDrawerControls";
import { integrationCategories } from "./integrations-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const actions = {
  connectProvider: vi.fn(async () => undefined),
  disconnectProvider: vi.fn(async () => undefined),
  setPrimaryProvider: vi.fn(async () => undefined),
  testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
  updateProviderCost: vi.fn(async () => undefined),
} satisfies ProviderActionHandlers;

function connectableDataForSeo(): IntegrationProviderData {
  const provider = integrationCategories[0].providers[0];

  return {
    ...provider,
    drawer: {
      ...provider.drawer,
      credentialFields: providerCredentialFieldsFor("dataforseo", { connected: false }),
      defaults: { ...provider.drawer.defaults, login: "", primary: false, secret: "" },
    },
    primary: false,
    status: "ready",
  };
}

function connectedDataForSeo(): IntegrationProviderData {
  const provider = integrationCategories[0].providers[0];

  return {
    ...provider,
    drawer: {
      ...provider.drawer,
      defaults: { ...provider.drawer.defaults, primary: false, secret: "" },
    },
    primary: false,
    status: "connected",
  };
}

function connectableSerpApi(): IntegrationProviderData {
  const provider = integrationCategories[0].providers[1];

  return {
    ...provider,
    primary: false,
    status: "ready",
  };
}

function connectablePlausible(): IntegrationProviderData {
  const provider = integrationCategories[1].providers[1];

  return {
    ...provider,
    id: "plausible",
    name: "Plausible Analytics",
    primary: false,
    secondaryAction: undefined,
    status: "ready",
    drawer: {
      ...provider.drawer,
      credentialFields: providerCredentialFieldsFor("plausible", { connected: false }),
      defaults: {
        ...provider.drawer.defaults,
        endpoint: "",
        login: "",
        primary: false,
        secret: "",
      },
    },
  };
}

describe("ConnectDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders activity, environment hints, and positive or negative action notices", () => {
    const provider = connectableDataForSeo();
    const { rerender } = render(
      <>
        <ActivityList provider={provider} />
        <EnvHint provider={provider} />
        <ConnectionOkBanner message="Connection ready" />
        <ActionNotice
          notice={{ balance: 1.23456, message: "Credentials work", ok: true, title: "Passed" }}
        />
      </>,
    );
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(
      screen.getByText("Credentials can also be configured through environment variables."),
    ).toBeInTheDocument();
    expect(screen.getByText("Connection ready")).toBeInTheDocument();
    expect(screen.getByText("Balance: $1.2346")).toBeInTheDocument();

    rerender(
      <ActionNotice notice={{ message: "Credentials failed", ok: false, title: "Failed" }} />,
    );
    expect(screen.getByText("Failed")).toHaveStyle({ color: "var(--red)" });
    expect(screen.queryByText(/Balance:/)).not.toBeInTheDocument();

    rerender(
      <ActionNotice
        notice={{
          action: "refresh",
          message: "Refresh to continue.",
          ok: false,
          title: "App update required",
          tone: "warning",
        }}
      />,
    );
    expect(screen.getByText("App update required")).toHaveStyle({ color: "var(--yellow)" });
    expect(screen.getByRole("button", { name: "Refresh app" })).toHaveAttribute("type", "button");
  });

  it("hides operator environment hints when the view does not expose one", () => {
    const provider = connectableDataForSeo();
    render(
      <EnvHint provider={{ ...provider, drawer: { ...provider.drawer, envHint: undefined } }} />,
    );

    expect(
      screen.queryByText("Credentials can also be configured through environment variables."),
    ).not.toBeInTheDocument();
  });

  it("keeps connection tests disabled until required credentials are filled", () => {
    render(
      <ConnectDrawer
        actions={actions}
        onClose={vi.fn()}
        open
        projectId="prj_1"
        provider={connectableDataForSeo()}
      />,
    );

    const testButton = screen.getByRole("button", { name: "Test connection" });
    expect(testButton).toBeDisabled();

    fireEvent.click(testButton);
    expect(actions.testProviderConnection).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "login" } });
    expect(testButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "password" } });
    expect(testButton).toBeEnabled();
  });

  it("keeps fallback controls out of individual provider drawers", () => {
    render(
      <ConnectDrawer
        actions={actions}
        onClose={vi.fn()}
        open
        projectId="prj_1"
        provider={connectableDataForSeo()}
      />,
    );

    expect(screen.queryByText("Provider fallback chain")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("enables save only for credentials that passed the current connection test", async () => {
    render(
      <ConnectDrawer
        actions={actions}
        onClose={vi.fn()}
        open
        projectId="prj_1"
        provider={connectableDataForSeo()}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "Connect provider" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "login" } });
    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "password" } });
    expect(saveButton).toBeDisabled();

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(await screen.findByText("Test connection before saving.")).toBeInTheDocument();
    expect(actions.connectProvider).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(actions.testProviderConnection).toHaveBeenCalledTimes(1));
    expect(saveButton).toBeEnabled();
    expect(screen.getByRole("button", { name: "Connected" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "changed" } });

    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeInTheDocument();

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(await screen.findByText("Test connection before saving.")).toBeInTheDocument();
    expect(actions.connectProvider).not.toHaveBeenCalled();
  });

  it("closes the drawer and clears the secret after a successful save", async () => {
    const onClose = vi.fn();
    render(
      <ConnectDrawer
        actions={actions}
        onClose={onClose}
        open
        projectId="prj_1"
        provider={connectableDataForSeo()}
      />,
    );

    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "login" } });
    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(actions.testProviderConnection).toHaveBeenCalledTimes(1));

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(actions.connectProvider).toHaveBeenCalledTimes(1));
    expect(actions.connectProvider).toHaveBeenCalledWith(
      expect.objectContaining({ login: "login", secret: "password" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("API password")).toHaveValue("");
  });

  it("submits a blank cost field as undefined without a validation error", async () => {
    render(
      <ConnectDrawer
        actions={actions}
        onClose={vi.fn()}
        open
        projectId="prj_1"
        provider={connectableSerpApi()}
      />,
    );

    expect(screen.getByText("Provider rates")).toBeInTheDocument();
    expect(screen.queryByText("Cost estimate per check (USD)")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "serp-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(actions.testProviderConnection).toHaveBeenCalledTimes(1));

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(actions.connectProvider).toHaveBeenCalledTimes(1));
    expect(actions.connectProvider).toHaveBeenCalledWith(
      expect.objectContaining({ costPerCheck: undefined, providerId: "serpapi" }),
    );
    expect(screen.queryByText(/expected number|received nan/i)).not.toBeInTheDocument();
  });

  it("renders an unresolved drawer rate as Not set instead of zero", () => {
    const provider = connectedDataForSeo();
    render(
      <ConnectDrawer
        actions={actions}
        onClose={vi.fn()}
        open
        projectId="prj_1"
        provider={{
          ...provider,
          drawer: {
            ...provider.drawer,
            rates: [
              {
                feature: "ranked_keywords",
                label: "Ranked keywords",
                source: "unknown",
                unit: "calls",
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("no rate yet")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("saves connected-provider settings without a fresh test when credentials are untouched", async () => {
    const onClose = vi.fn();
    render(
      <ConnectDrawer
        actions={actions}
        onClose={onClose}
        open
        projectId="prj_1"
        provider={connectedDataForSeo()}
      />,
    );

    expect(screen.getByLabelText("API login")).toHaveValue("team@example.com");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(actions.connectProvider).toHaveBeenCalledTimes(1));
    expect(actions.testProviderConnection).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("requires a fresh test after editing credentials but lets a blank secret use the stored one", async () => {
    render(
      <ConnectDrawer
        actions={actions}
        onClose={vi.fn()}
        open
        projectId="prj_1"
        provider={connectedDataForSeo()}
      />,
    );

    fireEvent.change(screen.getByLabelText("API login"), {
      target: { value: "new-user@example.com" },
    });

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toBeDisabled();

    const testButton = screen.getByRole("button", { name: "Test connection" });
    expect(testButton).toBeEnabled();
    fireEvent.click(testButton);
    await waitFor(() => expect(actions.testProviderConnection).toHaveBeenCalledTimes(1));
    expect(actions.testProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({ login: "new-user@example.com", secret: undefined }),
    );
    expect(saveButton).toBeEnabled();
  });

  it("keeps Plausible in key mode and maps token credentials", async () => {
    render(
      <ConnectDrawer
        actions={actions}
        onClose={vi.fn()}
        open
        projectId="prj_1"
        provider={connectablePlausible()}
      />,
    );

    const testButton = screen.getByRole("button", { name: "Test connection" });
    expect(screen.getByLabelText("Site domain")).toBeInTheDocument();
    expect(screen.getByLabelText("API token")).toBeInTheDocument();
    expect(screen.getByLabelText(/API base URL/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Leave blank for Plausible Cloud. Set this only for a self-hosted instance.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cost estimate per check (USD)")).not.toBeInTheDocument();
    expect(testButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Site domain"), { target: { value: "example.com" } });
    fireEvent.change(screen.getByLabelText("API token"), { target: { value: "stats-token" } });
    expect(testButton).toBeEnabled();

    fireEvent.click(testButton);
    await waitFor(() => expect(actions.testProviderConnection).toHaveBeenCalledTimes(1));
    expect(actions.testProviderConnection).toHaveBeenCalledWith({
      credentials: { apiKey: "stats-token", login: "example.com" },
      projectId: "prj_1",
      providerId: "plausible",
    });

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(actions.connectProvider).toHaveBeenCalledTimes(1));
    expect(actions.connectProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { apiKey: "stats-token", login: "example.com" },
        providerId: "plausible",
      }),
    );
  });

  it("does not show API-key test and save controls for OAuth providers", () => {
    const connectedGsc = integrationCategories[1].providers[0];
    const provider = {
      ...connectedGsc,
      drawer: {
        ...connectedGsc.drawer,
        defaults: { ...connectedGsc.drawer.defaults, login: "" },
      },
      secondaryAction: undefined,
      status: "ready" as const,
    };
    render(
      <ConnectDrawer
        actions={actions}
        onClose={vi.fn()}
        open
        projectId="prj_1"
        provider={provider}
      />,
    );

    expect(screen.getByRole("link", { name: "Connect Google account" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Test connection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect provider" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Credentials can also be configured through environment variables."),
    ).not.toBeInTheDocument();
  });

  it("disconnects an already configured provider after confirmation", async () => {
    const onClose = vi.fn();
    render(
      <ConnectDrawer
        actions={actions}
        onClose={onClose}
        open
        projectId="prj_1"
        provider={{ ...connectableDataForSeo(), status: "connected" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Disconnect provider" }));
    const confirm = screen.getAllByRole("button", { name: "Disconnect provider" }).at(-1);
    expect(confirm).toBeDefined();
    if (confirm) fireEvent.click(confirm);
    await waitFor(() => expect(actions.disconnectProvider).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
