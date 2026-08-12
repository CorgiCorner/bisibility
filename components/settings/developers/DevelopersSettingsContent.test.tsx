import { DevelopersSettingsContent } from "@/components/settings/developers/DevelopersSettingsContent";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const apiKeys = [
  {
    createdLabel: "created Feb 4, 2025",
    expiresLabel: "never expires",
    id: "key_example",
    isExpired: false,
    lastUsedLabel: "last used 2 hours ago",
    maskedValue: "bsb_key_live_example******",
    name: "CI deploy checks",
  },
] as const;

const hooks = [
  {
    createdLabel: "created Feb 4, 2025",
    disabled: false,
    id: "dwh_example",
    label: "Production deploys",
    lastUsedLabel: "last used 2 hours ago",
  },
] as const;

const baseProps = {
  apiKeys,
  canManage: true,
  docsHref: "/app/prj_example/docs",
  endpointUrl: "https://example.com/api/ingest/deploy",
  hooks,
  projectId: "prj_example",
} as const;

describe("DevelopersSettingsContent", () => {
  it("renders the exact API-key state without inventing unavailable metadata", () => {
    render(<DevelopersSettingsContent {...baseProps} />);

    const card = screen.getByRole("region", { name: "API keys" });
    const row = card.querySelector("[data-api-key-row]");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("CI deploy checks")).toBeVisible();
    expect(within(row as HTMLElement).getByText("bsb_key_live_example******")).toBeVisible();
    expect(within(row as HTMLElement).queryByText(/created by/i)).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("Read and write")).not.toBeInTheDocument();
  });

  it("renders the literal no-keys state as a quiet row", () => {
    render(<DevelopersSettingsContent {...baseProps} apiKeys={[]} />);

    expect(screen.getByText("No keys yet")).toBeVisible();
    expect(screen.getByText("The first key is made with Create key.")).toBeVisible();
  });

  it("keeps creation-only guidance out of persistent Developers cards", () => {
    render(<DevelopersSettingsContent {...baseProps} />);

    const apiKeysCard = screen.getByRole("region", { name: "API keys" });
    expect(
      within(apiKeysCard).queryByText("In the Create key dialog · scopes"),
    ).not.toBeInTheDocument();
    expect(within(apiKeysCard).queryByText("Creating a key")).not.toBeInTheDocument();
    expect(
      within(apiKeysCard).queryByText(
        "The secret is shown once, at creation. A lost key is rolled, not recovered.",
      ),
    ).not.toBeInTheDocument();

    const deployWebhooksCard = screen.getByRole("region", { name: "Deploy webhooks" });
    expect(within(deployWebhooksCard).queryByText("Adding a hook")).not.toBeInTheDocument();
    expect(
      within(deployWebhooksCard).queryByText(
        "The token is shown once, at creation and at rotation.",
      ),
    ).not.toBeInTheDocument();
  });

  it("explains the real active and disabled deploy hook behavior", () => {
    render(
      <DevelopersSettingsContent
        {...baseProps}
        hooks={[
          ...hooks,
          {
            ...hooks[0],
            disabled: true,
            id: "dwh_disabled_example",
            label: "Disabled deploys",
          },
        ]}
      />,
    );

    expect(screen.getByText("Send test posts a real signal and links to it.")).toBeVisible();
    expect(screen.getByText("Disabled: the row and the token stay.")).toBeVisible();
  });

  it("hides every mutation control when the server-derived capability is false", () => {
    render(
      <DevelopersSettingsContent
        {...baseProps}
        canManage={false}
        createHook={vi.fn()}
        deleteHook={vi.fn()}
        disableHook={vi.fn()}
        issueKey={vi.fn()}
        regenerateKey={vi.fn()}
        revokeKey={vi.fn()}
        rotateHook={vi.fn()}
        sendTestHook={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Create key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add deploy hook" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send .* test/i })).not.toBeInTheDocument();
  });

  it("sends a real deploy test through the provided audited action", async () => {
    const user = userEvent.setup();
    const sendTestHook = vi.fn().mockResolvedValue({
      signalHref: "/app/prj_example/timeline#signal-sig_example",
      signalId: "sig_example",
    });
    render(<DevelopersSettingsContent {...baseProps} sendTestHook={sendTestHook} />);

    await user.click(screen.getByRole("button", { name: "Send Production deploys test event" }));

    expect(sendTestHook).toHaveBeenCalledWith({
      hookId: "dwh_example",
      projectId: "prj_example",
    });
    expect(await screen.findByRole("link", { name: "View signal" })).toHaveAttribute(
      "href",
      "/app/prj_example/timeline#signal-sig_example",
    );
  });
});
