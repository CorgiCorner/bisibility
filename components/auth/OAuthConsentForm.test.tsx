import {
  authFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthConsentForm, type OAuthConsentFormProps } from "./OAuthConsentForm";

function render(ui: ReactElement) {
  return renderWithFeatureMessages(ui, { messages: authFeatureTestMessages });
}

const mocks = vi.hoisted(() => ({
  consent: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    oauth2: { consent: mocks.consent },
    signOut: mocks.signOut,
  },
}));

function consentProps(overrides: Partial<OAuthConsentFormProps> = {}): OAuthConsentFormProps {
  return {
    account: { email: "owner@example.com", initials: "OE" },
    client: {
      dynamic: true,
      id: "client_1",
      name: "Codex",
      redirectUri: "127.0.0.1:51008/callback/request",
    },
    expiresAt: Date.now() + 300_000,
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "read",
      "write",
      "admin",
      "tokens:write",
    ],
    ...overrides,
  };
}

describe("OAuthConsentForm", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-07-31T10:00:00.000Z").getTime());
  });

  it("names the app, explains high-risk access, and hides technical details by default", () => {
    render(<OAuthConsentForm {...consentProps()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Allow Codex to access your account?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("127.0.0.1")).toBeInTheDocument();
    expect(
      screen.getByText(/Registered automatically, not reviewed by bisibility/),
    ).toBeInTheDocument();
    expect(screen.getByText(/delete projects and manage members and API keys/)).toBeInTheDocument();
    expect(screen.getByText(/Within your existing permissions/)).toBeInTheDocument();
    expect(screen.getByText(/They keep working after disconnection/)).toBeInTheDocument();
    expect(screen.getByText(/Access renews until revoked/)).toBeInTheDocument();
    expect(screen.getByText("client_1")).not.toBeVisible();
    expect(screen.getByText("127.0.0.1:51008/callback/request")).not.toBeVisible();
    expect(screen.getByText("Technical details").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Request expires in 5:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow Codex" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
    expect(screen.queryByText("DCR")).not.toBeInTheDocument();
  });

  it("warns about unknown permissions without treating them as ordinary read access", () => {
    render(<OAuthConsentForm {...consentProps({ scopes: ["openid", "custom:scope"] })} />);
    expect(
      screen.getByText(/additional permissions that bisibility cannot describe/),
    ).toBeVisible();
    expect(screen.getByText("openid, custom:scope")).not.toBeVisible();
    expect(screen.queryByText(/read your project and rank data/i)).not.toBeInTheDocument();
  });

  it("shows only read access without token creation or automatic renewal for a read-only request", () => {
    render(
      <OAuthConsentForm
        {...consentProps({
          scopes: ["read"],
          client: {
            dynamic: true,
            id: "chat-client",
            name: "ChatGPT",
            redirectUri: "chatgpt.com/connector/oauth/callback",
          },
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Allow ChatGPT" })).toBeEnabled();
    expect(screen.getByText("chatgpt.com")).toBeVisible();
    expect(screen.getByText(/read your project and rank data/i)).toBeVisible();
    expect(screen.queryByText(/Create API tokens/)).not.toBeInTheDocument();
    expect(screen.queryByText(/change|administer/)).not.toBeInTheDocument();
    expect(screen.getByText("Access lasts up to 1 hour.")).toBeVisible();
  });

  it("grants only the displayed read scopes for a broad ChatGPT request", async () => {
    mocks.consent.mockResolvedValue({ data: {}, error: null });
    render(
      <OAuthConsentForm
        {...consentProps({
          client: {
            dynamic: true,
            id: "chat-client",
            name: "ChatGPT",
            redirectUri: "chat.example.com/callback",
          },
        })}
      />,
    );
    expect(screen.getByText(/read your project and rank data/i)).toBeVisible();
    expect(screen.queryByText(/delete projects/)).not.toBeInTheDocument();
    expect(screen.queryByText("Create API tokens")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow ChatGPT" }));
    await screen.findByText("Consent response did not include a redirect URI.");
    expect(mocks.consent).toHaveBeenCalledWith({
      accept: true,
      scope: "openid profile email offline_access read",
    });
  });

  it("does not submit an empty grant when only unsupported scopes were requested", async () => {
    render(
      <OAuthConsentForm
        {...consentProps({
          client: {
            dynamic: true,
            id: "chat-client",
            name: "ChatGPT",
            redirectUri: "chat.example.com/callback",
          },
          scopes: ["admin", "tokens:write"],
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Allow ChatGPT" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No supported permissions were requested",
    );
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
  });

  it("also warns about persistent credentials when admin grants API key creation", () => {
    render(<OAuthConsentForm {...consentProps({ scopes: ["admin"] })} />);
    expect(screen.getByText("Create API tokens")).toBeVisible();
    expect(screen.getByText(/delete projects and manage members and API keys/)).toBeVisible();
  });

  it("disables consent when the client identifier is missing", () => {
    render(
      <OAuthConsentForm
        {...consentProps({
          client: { dynamic: false, id: "", name: "Unknown client", redirectUri: null },
          scopes: [],
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Allow this app to access your account?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grant access" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
  });

  it("switches to the expired state when the signed request is no longer valid", () => {
    render(<OAuthConsentForm {...consentProps({ expiresAt: Date.now() - 1 })} />);

    expect(screen.getByText("Request expired")).toBeInTheDocument();
    expect(screen.getByText("codex mcp login bisibility")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow Codex" })).not.toBeInTheDocument();
  });

  it("shows CLI-specific token and retry guidance", () => {
    const client = {
      dynamic: false,
      id: "bisibility-cli",
      name: "Bisibility CLI",
      redirectUri: "127.0.0.1:8976/callback",
    };
    const view = render(
      <OAuthConsentForm
        {...consentProps({ client, scopes: ["openid", "profile", "email", "tokens:write"] })}
      />,
    );

    expect(screen.getByText("Create API tokens")).toBeInTheDocument();

    view.rerender(<OAuthConsentForm {...consentProps({ client, expiresAt: Date.now() - 1 })} />);
    expect(screen.getByText("bisibility auth login")).toBeInTheDocument();
    expect(screen.queryByText("codex mcp login bisibility")).not.toBeInTheDocument();
  });

  it("does not suggest another client's command when an unknown request expires", () => {
    render(
      <OAuthConsentForm
        {...consentProps({
          client: {
            dynamic: true,
            id: "dynamic_client_2",
            name: "Unknown client",
            redirectUri: null,
          },
          expiresAt: Date.now() - 1,
        })}
      />,
    );

    expect(screen.getByText("Start a fresh connection from your app.")).toBeInTheDocument();
    expect(screen.queryByText("codex mcp login bisibility")).not.toBeInTheDocument();
    expect(screen.queryByText("bisibility auth login")).not.toBeInTheDocument();
  });

  it("accepts a signed-query request without a legacy consent code", async () => {
    mocks.consent.mockResolvedValue({ data: {}, error: null });
    render(<OAuthConsentForm {...consentProps({ scopes: ["email"] })} />);

    fireEvent.click(screen.getByRole("button", { name: "Allow Codex" }));

    expect(
      await screen.findByText("Consent response did not include a redirect URI."),
    ).toBeInTheDocument();
    expect(mocks.consent).toHaveBeenCalledWith({ accept: true, scope: "email" });
  });

  it("posts denial and maps provider and network failures", async () => {
    mocks.consent.mockResolvedValueOnce({
      data: null,
      error: { error_description: "Consent expired" },
    });
    const view = render(<OAuthConsentForm {...consentProps({ scopes: ["profile"] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(await screen.findByText("Consent expired")).toBeInTheDocument();

    mocks.consent.mockRejectedValueOnce(new Error("Network unavailable"));
    view.rerender(<OAuthConsentForm {...consentProps({ scopes: ["custom"] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Allow Codex" }));
    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
  });

  it("rejects unsafe redirect schemes", async () => {
    mocks.consent.mockResolvedValue({
      data: { redirect: true, url: "javascript:alert(1)" },
      error: null,
    });
    render(<OAuthConsentForm {...consentProps({ scopes: ["openid"] })} />);

    fireEvent.click(screen.getByRole("button", { name: "Allow Codex" }));
    expect(
      await screen.findByText("Consent response returned an unsupported redirect URI."),
    ).toBeInTheDocument();
  });

  it("prefers the API message and falls back when no message is available", async () => {
    mocks.consent.mockResolvedValueOnce({
      data: null,
      error: { message: "Consent request rejected" },
    });
    const view = render(<OAuthConsentForm {...consentProps({ scopes: ["openid"] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Allow Codex" }));
    expect(await screen.findByText("Consent request rejected")).toBeInTheDocument();

    mocks.consent.mockResolvedValueOnce({ data: null, error: {} });
    view.rerender(<OAuthConsentForm {...consentProps({ scopes: ["openid"] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Allow Codex" }));
    expect(await screen.findByText("Could not complete the consent request.")).toBeInTheDocument();
  });
});
