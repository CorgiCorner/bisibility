import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthConsentForm, type OAuthConsentFormProps } from "./OAuthConsentForm";

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

  it("renders account, DCR client, callback, grouped scopes, and token lifetime", () => {
    render(<OAuthConsentForm {...consentProps()} />);

    expect(screen.getByText("Approving as")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("client_1")).toBeInTheDocument();
    expect(screen.getByText("127.0.0.1:51008/callback/request")).toBeInTheDocument();
    expect(screen.getByText("DCR")).toBeInTheDocument();
    expect(screen.getByLabelText(/registered dynamically/i)).toBeInTheDocument();
    expect(screen.getByText("Sign-in & session")).toBeInTheDocument();
    expect(screen.getByText("MCP & API access")).toBeInTheDocument();
    expect(screen.getByText("Credentials")).toBeInTheDocument();
    for (const scope of [
      "openid",
      "profile",
      "email",
      "offline_access",
      "read",
      "write",
      "admin",
      "tokens:write",
    ]) {
      expect(screen.getByText(scope)).toBeInTheDocument();
    }
    expect(screen.getByText("1 hour")).toBeInTheDocument();
    expect(screen.getByText("30 days")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "The short-lived credential this client uses to call Bisibility. It expires after 1 hour.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Allows this client to obtain new access tokens for up to 30 days without asking you to approve every hour.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("expires in 5:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
  });

  it("keeps unknown scopes visible in an Other group", () => {
    render(<OAuthConsentForm {...consentProps({ scopes: ["openid", "custom:scope"] })} />);

    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText("custom:scope")).toBeInTheDocument();
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

    expect(screen.getAllByText("Unknown client")).toHaveLength(2);
    expect(screen.getByText("openid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
  });

  it("switches to the expired state when the signed request is no longer valid", () => {
    render(<OAuthConsentForm {...consentProps({ expiresAt: Date.now() - 1 })} />);

    expect(screen.getByText("Request expired")).toBeInTheDocument();
    expect(screen.getByText("codex mcp login bisibility")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
  });

  it("accepts a signed-query request without a legacy consent code", async () => {
    mocks.consent.mockResolvedValue({ data: {}, error: null });
    render(<OAuthConsentForm {...consentProps({ scopes: ["email"] })} />);

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    expect(
      await screen.findByText("Consent response did not include a redirect URI."),
    ).toBeInTheDocument();
    expect(mocks.consent).toHaveBeenCalledWith({ accept: true });
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
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
  });

  it("rejects unsafe redirect schemes", async () => {
    mocks.consent.mockResolvedValue({
      data: { redirect: true, url: "javascript:alert(1)" },
      error: null,
    });
    render(<OAuthConsentForm {...consentProps({ scopes: ["openid"] })} />);

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByText("Consent request rejected")).toBeInTheDocument();

    mocks.consent.mockResolvedValueOnce({ data: null, error: {} });
    view.rerender(<OAuthConsentForm {...consentProps({ scopes: ["openid"] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByText("Could not complete the consent request.")).toBeInTheDocument();
  });
});
