import { providerCredentialFieldsFor } from "@/lib/integrations/credential-fields";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectDrawer } from "./ConnectDrawer";
import { ActionNotice, ActivityList, ConnectionOkBanner } from "./ConnectDrawerControls";
import { integrationCategories } from "./integrations-fixtures";

const actions = {
  connectProvider: vi.fn(async () => undefined),
  disconnectProvider: vi.fn(async () => undefined),
  testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
  updateProviderCost: vi.fn(async () => undefined),
  updateProviderSettings: vi.fn(async () => undefined),
} satisfies ProviderActionHandlers;

function connectableDataForSeo(): IntegrationProviderData {
  const provider = integrationCategories[0].providers[0];

  return {
    ...provider,
    drawer: {
      ...provider.drawer,
      credentialFields: providerCredentialFieldsFor("dataforseo", { connected: false }),
      defaults: { ...provider.drawer.defaults, login: "", secret: "" },
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
      activities: [
        { label: "Last used", value: "12 min ago" },
        { label: "Connection updated", value: "1 day ago" },
        { label: "Fallback state", value: "Enabled" },
      ],
      defaults: { ...provider.drawer.defaults, secret: "" },
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
        secret: "",
      },
    },
  };
}

function renderDrawer(
  provider: IntegrationProviderData = connectableDataForSeo(),
  overrides: Partial<ComponentProps<typeof ConnectDrawer>> = {},
) {
  const onClose = vi.fn();
  const view = render(
    <ConnectDrawer
      actions={actions}
      onClose={onClose}
      open
      projectId="prj_1"
      provider={provider}
      {...overrides}
    />,
  );
  return { onClose, view };
}

describe("ConnectDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders activity and positive or negative action notices", () => {
    const provider = connectableDataForSeo();
    const { rerender } = render(
      <>
        <ActivityList provider={provider} />
        <ConnectionOkBanner message="Connection ready" />
        <ActionNotice
          notice={{ balance: 1.23456, message: "Credentials work", ok: true, title: "Passed" }}
        />
      </>,
    );
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
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

  it("does not render environment-variable credential guidance", () => {
    renderDrawer();

    expect(
      screen.queryByText("Credentials can also be configured through environment variables."),
    ).not.toBeInTheDocument();
  });

  it("shows recent activity only for SERP provider drawers", () => {
    const plausible = connectablePlausible();
    const { view } = renderDrawer({ ...plausible, status: "connected" });

    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Last sync")).not.toBeInTheDocument();
    expect(screen.queryByText("Connection updated")).not.toBeInTheDocument();
    expect(screen.queryByText("Connection state")).not.toBeInTheDocument();

    view.unmount();
    renderDrawer(connectedDataForSeo());

    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText("Last used")).toBeInTheDocument();
  });

  it("keeps connection tests disabled until required credentials are filled", () => {
    renderDrawer();

    const testButton = screen.getByRole("button", { name: "Test connection" });
    expect(testButton).toBeDisabled();
    expect(testButton.querySelector('[data-icon="lightning"]')).toBeNull();

    fireEvent.click(testButton);
    expect(actions.testProviderConnection).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "login" } });
    expect(testButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "password" } });
    expect(testButton).toBeEnabled();
  });

  it("places a failed key-auth connection notice immediately after all credential fields", async () => {
    actions.testProviderConnection.mockResolvedValueOnce({
      message: "Credentials were rejected",
      ok: false,
    });
    renderDrawer();

    const loginInput = screen.getByLabelText("API login");
    const passwordInput = screen.getByLabelText("API password");
    const credentialFields = loginInput.closest("label")?.parentElement;
    expect(credentialFields).toBe(passwordInput.closest("label")?.parentElement);
    if (!credentialFields) throw new Error("Expected the credential-fields grid");

    fireEvent.change(loginInput, { target: { value: "login" } });
    fireEvent.change(passwordInput, { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    const alert = await screen.findByRole("alert");
    const providerRates = screen.getByText("Provider rates").closest("section");
    const recentActivity = screen.getByText("Recent activity").closest("section");

    expect(credentialFields.nextElementSibling).toBe(alert);
    expect(alert.compareDocumentPosition(providerRates as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(alert.compareDocumentPosition(recentActivity as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("keeps fallback controls out of individual provider drawers", () => {
    renderDrawer();

    expect(screen.queryByText("Provider fallback chain")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("enables save only for credentials that passed the current connection test", async () => {
    renderDrawer();

    const saveButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "Connect provider",
    });
    const saveForm = saveButton.form;
    expect(saveForm).toBeInstanceOf(HTMLFormElement);
    if (!saveForm) throw new Error("Expected the save button to be associated with its form");
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "login" } });
    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "password" } });
    expect(saveButton).toBeDisabled();

    // Exercise the defensive submit guard directly because a disabled button cannot be clicked.
    fireEvent.submit(saveForm);
    expect(await screen.findByText("Test connection before saving.")).toBeInTheDocument();
    expect(actions.connectProvider).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(actions.testProviderConnection).toHaveBeenCalledTimes(1));
    expect(saveButton).toBeEnabled();
    expect(screen.getByRole("button", { name: "Verified" })).toBeInTheDocument();
    expect(screen.getByText("Connection verified.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "changed" } });

    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeInTheDocument();

    fireEvent.submit(saveForm);
    expect(await screen.findByText("Test connection before saving.")).toBeInTheDocument();
    expect(actions.connectProvider).not.toHaveBeenCalled();
  });

  it("uses the standard button loader while testing a connection", async () => {
    let finishTest: ((result: { message: string; ok: true }) => void) | undefined;
    actions.testProviderConnection.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishTest = resolve;
        }),
    );
    renderDrawer();

    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "login" } });
    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    const testingButton = await screen.findByRole("button", { name: "Testing…" });
    expect(testingButton).toHaveAttribute("aria-busy", "true");
    expect(testingButton.querySelector("[data-spinner]")).toBeInTheDocument();

    finishTest?.({ message: "ok", ok: true });
    expect(await screen.findByRole("button", { name: "Verified" })).toBeInTheDocument();
  });

  it("closes the drawer and clears the secret after a successful save", async () => {
    const { onClose } = renderDrawer();

    fireEvent.change(screen.getByLabelText("API login"), { target: { value: "login" } });
    fireEvent.change(screen.getByLabelText("API password"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(actions.testProviderConnection).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Connect provider" }));

    await waitFor(() => expect(actions.connectProvider).toHaveBeenCalledTimes(1));
    expect(actions.connectProvider).toHaveBeenCalledWith(
      expect.objectContaining({ login: "login", secret: "password" }),
    );
    const [input] = actions.connectProvider.mock.calls.at(0) as unknown as [
      Record<string, unknown>,
    ];
    expect(input).not.toHaveProperty("enabled");
    expect(input).not.toHaveProperty("primary");
    expect(input).not.toHaveProperty("priority");
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("API password")).toHaveValue("");
  });

  it("submits a blank cost field as undefined without a validation error", async () => {
    renderDrawer(connectableSerpApi());

    expect(screen.getByText("Provider rates")).toBeInTheDocument();
    expect(screen.queryByText("Cost estimate per check (USD)")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "serp-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(actions.testProviderConnection).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Connect provider" }));

    await waitFor(() => expect(actions.connectProvider).toHaveBeenCalledTimes(1));
    expect(actions.connectProvider).toHaveBeenCalledWith(
      expect.objectContaining({ costPerCheck: undefined, providerId: "serpapi" }),
    );
    expect(screen.queryByText(/expected number|received nan/i)).not.toBeInTheDocument();
  });

  it("renders an unresolved drawer rate as Not set instead of zero", () => {
    const provider = connectedDataForSeo();
    renderDrawer({
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
    });

    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("no rate yet")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("saves connected-provider settings without a fresh test when credentials are untouched", async () => {
    const { onClose } = renderDrawer(connectedDataForSeo());

    expect(screen.getByLabelText("API login")).toHaveValue("team@example.com");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actions.connectProvider).toHaveBeenCalledTimes(1));
    expect(actions.testProviderConnection).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("requires a fresh test after editing credentials but lets a blank secret use the stored one", async () => {
    renderDrawer(connectedDataForSeo());

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
    renderDrawer(connectablePlausible());

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

    fireEvent.click(screen.getByRole("button", { name: "Connect provider" }));
    await waitFor(() => expect(actions.connectProvider).toHaveBeenCalledTimes(1));
    expect(actions.connectProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { apiKey: "stats-token", login: "example.com" },
        providerId: "plausible",
      }),
    );
  });

  it.each([
    ["self-host", "Sign in with Google, read-only. Tokens are stored encrypted in your instance."],
    ["cloud", "Sign in with Google, read-only. Tokens are stored encrypted in your workspace."],
  ] as const)("uses deployment-aware OAuth title copy for %s", (deploymentMode, expected) => {
    const connectedGsc = integrationCategories[1].providers[0];
    renderDrawer({ ...connectedGsc, status: "ready" }, { deploymentMode });

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("confirms inline Search Console disconnect before calling the provider action", async () => {
    const connectedGsc = integrationCategories[1].providers[0];
    const provider = {
      ...connectedGsc,
      drawer: {
        ...connectedGsc.drawer,
        accountEmail: "owner@example.com",
        defaults: { ...connectedGsc.drawer.defaults, login: "sc-domain:example.com" },
      },
      status: "connected" as const,
    };
    const { onClose } = renderDrawer(provider);

    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(actions.disconnectProvider).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Disconnect provider" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Disconnect provider" }));

    await waitFor(() =>
      expect(actions.disconnectProvider).toHaveBeenCalledWith({
        projectId: "prj_1",
        providerId: "gsc",
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
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
    renderDrawer(provider);

    expect(screen.getByRole("link", { name: "Connect Google account" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Test connection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect provider" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Credentials can also be configured through environment variables."),
    ).not.toBeInTheDocument();
  });
});
